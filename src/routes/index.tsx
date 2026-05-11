import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookOpen, Plus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/")({
  component: Index,
});

type Book = Tables<"books">;

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

function Index() {
  return (
    <AppShell>
      <Library />
    </AppShell>
  );
}

function Library() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [filter, setFilter] = useState<"all" | Book["status"]>("all");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("books")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setBooks(data ?? []));
  }, [user]);

  const filtered = books?.filter((b) => filter === "all" || b.status === filter) ?? [];

  return (
    <div className="space-y-4">
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
      </div>

      {books === null ? (
        <p className="text-center text-muted-foreground py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <BookOpen className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="font-semibold">
            {books.length === 0 ? "Your library is empty" : "Nothing here"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {books.length === 0
              ? "Add your first book by scanning, searching, or entering an ISBN."
              : "Try a different filter."}
          </p>
          {books.length === 0 && (
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
                <div className="aspect-[2/3] overflow-hidden rounded-md bg-muted">
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
