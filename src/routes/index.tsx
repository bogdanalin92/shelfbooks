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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen, ChevronDown, Plus, Search, X } from "lucide-react";
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
  want_to_buy: "Want to buy",
} as const;

const STATUS_DOT: Record<Book["status"], string> = {
  to_read: "bg-blue-500",
  reading: "bg-amber-500",
  finished: "bg-emerald-500",
  want_to_buy: "bg-violet-500",
};

const STATUS_BADGE_CLS: Record<Book["status"], string> = {
  to_read: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  reading: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  finished: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  want_to_buy: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
};

const FILTERS: { id: "all" | Book["status"]; label: string }[] = [
  { id: "all", label: "All" },
  { id: "to_read", label: "To read" },
  { id: "reading", label: "Reading" },
  { id: "finished", label: "Finished" },
  { id: "want_to_buy", label: "Want to buy" },
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
        (b.genres ?? []).some((g) => g.toLowerCase().includes(q)),
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
  const [genreFilter, setGenreFilter] = useState<Set<string>>(new Set());
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

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: resolvedBooks.length };
    for (const b of resolvedBooks) counts[b.status] = (counts[b.status] ?? 0) + 1;
    return counts;
  }, [resolvedBooks]);

  const allGenres = useMemo(
    () => [...new Set(resolvedBooks.flatMap((b) => b.genres ?? []))].sort(),
    [resolvedBooks],
  );

  const filtered = useMemo(() => {
    const base = resolvedBooks.filter((b) => {
      if (filter !== "all" && b.status !== filter) return false;
      if (genreFilter.size > 0) {
        const bookGenres = b.genres ?? [];
        if (!Array.from(genreFilter).some((g) => bookGenres.includes(g))) return false;
      }
      return true;
    });
    return sortBooks(base, sort);
  }, [resolvedBooks, filter, sort, genreFilter]);

  return (
    <div className="space-y-4">
      {/* Filter pills + search */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            {f.id !== "all" && (
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[f.id as Book["status"]]}`}
              />
            )}
            {f.label}
            {statusCounts[f.id] !== undefined && (
              <span
                className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${
                  filter === f.id
                    ? "bg-white/20 text-primary-foreground"
                    : "bg-background text-muted-foreground"
                }`}
              >
                {statusCounts[f.id]}
              </span>
            )}
          </button>
        ))}
        <button
          className="ml-auto shrink-0 inline-flex items-center justify-center rounded-full bg-muted p-2 text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
          onClick={() => setSearchOpen(true)}
          aria-label="Search library"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {/* Sort + Genre filter row */}
      <div className="flex items-center gap-2 flex-wrap">
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

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={genreFilter.size > 0 ? "default" : "outline"}
              className="h-8 text-xs gap-1 px-3"
            >
              {genreFilter.size > 0
                ? `${genreFilter.size} genre${genreFilter.size > 1 ? "s" : ""}`
                : "Genre"}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-52 p-2">
            {allGenres.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-1">No genres in library yet</p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-0.5">
                {allGenres.map((genre) => (
                  <label
                    key={genre}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm select-none"
                  >
                    <Checkbox
                      checked={genreFilter.has(genre)}
                      onCheckedChange={(checked) => {
                        setGenreFilter((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(genre);
                          else next.delete(genre);
                          return next;
                        });
                      }}
                    />
                    <span className="line-clamp-1">{genre}</span>
                  </label>
                ))}
              </div>
            )}
            {genreFilter.size > 0 && (
              <button
                onClick={() => setGenreFilter(new Set())}
                className="flex items-center gap-1 mt-1 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
              >
                <X className="h-3 w-3" /> Clear selection
              </button>
            )}
          </PopoverContent>
        </Popover>
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
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {filtered.map((b) => (
            <li key={b.id}>
              <Link to="/book/$id" params={{ id: b.id }} className="block group h-full">
                <div className="h-full flex flex-col rounded-2xl bg-card shadow-sm group-hover:shadow-lg transition-shadow duration-200 overflow-hidden">
                  {/* Cover */}
                  <div className="relative overflow-hidden bg-muted">
                    <div className="aspect-2/3">
                      {b.cover_url ? (
                        <img
                          src={b.cover_url}
                          alt={b.title}
                          loading="lazy"
                          className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 bg-linear-to-br from-muted to-muted/60 p-3 text-center">
                          <BookOpen className="h-8 w-8 text-muted-foreground/30" />
                          <span className="text-xs text-muted-foreground line-clamp-3 leading-tight">
                            {b.title}
                          </span>
                        </div>
                      )}
                    </div>
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-1.5 ${STATUS_DOT[b.status]}`}
                    />
                  </div>
                  {/* Content */}
                  <div className="flex flex-col gap-1.5 p-3 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide line-clamp-2 leading-snug">
                      {b.title}
                    </p>
                    {b.authors[0] && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{b.authors[0]}</p>
                    )}
                    <span
                      className={`mt-auto inline-block self-start rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE_CLS[b.status]}`}
                    >
                      {STATUS_LABEL[b.status]}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
