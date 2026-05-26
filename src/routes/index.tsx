import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { logError } from "@/lib/logger";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, Plus, Search } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/")({
  component: Index,
});

type Book = Tables<"books">;
type SortKey = "date_desc" | "date_asc" | "title_asc" | "author_asc";

const STATUS_LABEL = {
  to_read: "To read",
  reading: "Reading",
  finished: "Finished",
} as const;

const FILTERS: { id: "all" | Book["status"]; label: string }[] = [
  { id: "all", label: "All" },
  { id: "to_read", label: "To read" },
  { id: "reading", label: "Reading" },
  { id: "finished", label: "Finished" },
];

function sortBooks(books: Book[], sort: SortKey): Book[] {
  return [...books].sort((a, b) => {
    switch (sort) {
      case "title_asc":
        return a.title.localeCompare(b.title);
      case "author_asc":
        return (a.authors[0] ?? "").localeCompare(b.authors[0] ?? "");
      case "date_asc":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case "date_desc":
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });
}

function Index() {
  return (
    <AppShell>
      <Library />
    </AppShell>
  );
}

function LibrarySearch({
  books,
  open,
  onClose,
}: {
  books: Book[];
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.isbn ?? "").toLowerCase().includes(q) ||
        b.authors.some((a) => a.toLowerCase().includes(q)) ||
        b.genres.some((g) => g.toLowerCase().includes(q)),
    );
  }, [query, books]);

  const handleSelect = (id: string) => {
    onClose();
    setQuery("");
    navigate({ to: "/book/$id", params: { id } });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setQuery("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Search library</DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-2">
          <Input
            autoFocus
            placeholder="Title, author or ISBN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="max-h-96 overflow-y-auto divide-y">
          {query.trim() && results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No books match "<strong>{query}</strong>"
            </p>
          ) : (
            results.map((b) => (
              <button
                key={b.id}
                onClick={() => handleSelect(b.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors"
              >
                <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-muted">
                  {b.cover_url ? (
                    <img src={b.cover_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <BookOpen className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium line-clamp-1">{b.title}</p>
                  {b.authors[0] && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{b.authors[0]}</p>
                  )}
                  {b.isbn && <p className="text-xs text-muted-foreground font-mono">{b.isbn}</p>}
                </div>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                  {STATUS_LABEL[b.status]}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SORT_STORAGE_KEY = "shelfbooks:sort";

function getSavedSort(): SortKey {
  try {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    if (
      saved === "date_desc" ||
      saved === "date_asc" ||
      saved === "title_asc" ||
      saved === "author_asc"
    ) {
      return saved;
    }
  } catch {
    // localStorage unavailable (e.g. SSR or private mode)
  }
  return "date_desc";
}

function Library() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | Book["status"]>("all");
  const [sort, setSort] = useState<SortKey>(getSavedSort);
  const [searchOpen, setSearchOpen] = useState(false);

  const {
    data: books,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["books", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("books").select("*").eq("user_id", user!.id);
      if (error) {
        logError("library.fetch", error.message, error);
        throw error;
      }
      return (data ?? []) as Book[];
    },
    enabled: !!user,
  });

  const resolvedBooks = useMemo(() => books ?? [], [books]);

  const filtered = useMemo(() => {
    const base = resolvedBooks.filter((b) => filter === "all" || b.status === filter);
    return sortBooks(base, sort);
  }, [resolvedBooks, filter, sort]);

  return (
    <div className="space-y-4">
      {/* Filter pills + search */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filter === f.id ? "default" : "outline"}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto shrink-0"
          onClick={() => setSearchOpen(true)}
          aria-label="Search library"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* Sort control */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Sort by</span>
        <Select
          value={sort}
          onValueChange={(v) => {
            const key = v as SortKey;
            setSort(key);
            try {
              localStorage.setItem(SORT_STORAGE_KEY, key);
            } catch {
              // ignore
            }
          }}
        >
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Date added (newest)</SelectItem>
            <SelectItem value="date_asc">Date added (oldest)</SelectItem>
            <SelectItem value="title_asc">Title A → Z</SelectItem>
            <SelectItem value="author_asc">Author A → Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <LibrarySearch books={resolvedBooks} open={searchOpen} onClose={() => setSearchOpen(false)} />

      {isError ? (
        <p className="text-center text-destructive py-12">
          Failed to load your library. Please refresh.
        </p>
      ) : isLoading ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="space-y-2">
              <Skeleton className="aspect-2/3 w-full rounded-md" />
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </li>
          ))}
        </ul>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="font-semibold">
            {resolvedBooks.length === 0 ? "Your library is empty" : "Nothing here"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {resolvedBooks.length === 0
              ? "Add your first book by scanning, searching, or entering an ISBN."
              : "Try a different filter."}
          </p>
          {resolvedBooks.length === 0 && (
            <Button asChild>
              <Link to="/add">
                <Plus className="h-4 w-4 mr-1" /> Add a book
              </Link>
            </Button>
          )}
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((b) => (
            <li key={b.id}>
              <Link to="/book/$id" params={{ id: b.id }} className="block group">
                <div className="aspect-2/3 overflow-hidden rounded-md bg-muted">
                  {b.cover_url ? (
                    <img
                      src={b.cover_url}
                      alt={b.title}
                      loading="lazy"
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground p-2 text-center">
                      {b.title}
                    </div>
                  )}
                </div>
                <div className="mt-2 space-y-0.5">
                  <p className="text-sm font-medium line-clamp-2">{b.title}</p>
                  {b.authors[0] && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{b.authors[0]}</p>
                  )}
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {STATUS_LABEL[b.status]}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
