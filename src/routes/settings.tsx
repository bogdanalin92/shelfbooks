import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { logError } from "@/lib/logger";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Check, X, Tag, User } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/settings")({
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

type Book = Tables<"books">;

// ─── Genre row ────────────────────────────────────────────────────────────────

function GenreRow({
  genre,
  count,
  onRename,
  onDelete,
}: {
  genre: string;
  count: number;
  onRename: (oldName: string, newName: string) => Promise<void>;
  onDelete: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(genre);
  const [saving, setSaving] = useState(false);

  const commitRename = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === genre) {
      setValue(genre);
      setEditing(false);
      return;
    }
    setSaving(true);
    await onRename(genre, trimmed);
    setSaving(false);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") { setValue(genre); setEditing(false); }
  };

  return (
    <div className="flex items-center gap-2 py-2">
      {editing ? (
        <>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-7 text-sm flex-1"
          />
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={commitRename} disabled={saving}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setValue(genre); setEditing(false); }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm truncate">{genre}</span>
          <Badge variant="secondary" className="text-xs shrink-0">{count}</Badge>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditing(true)} aria-label={`Rename ${genre}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={() => onDelete(genre)} aria-label={`Delete ${genre}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: books = [], isLoading } = useQuery<Book[]>({
    queryKey: ["books", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("books").select("*").eq("user_id", user!.id);
      if (error) { logError("settings.fetch", error.message, error); throw error; }
      return (data ?? []) as Book[];
    },
    enabled: !!user,
  });

  // { genre -> count }
  const genreMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const book of books) {
      for (const g of book.genres ?? []) {
        map.set(g, (map.get(g) ?? 0) + 1);
      }
    }
    return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [books]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["books", user?.id] });

  const handleRename = async (oldName: string, newName: string) => {
    const affected = books.filter((b) => (b.genres ?? []).includes(oldName));
    const updates = affected.map((b) =>
      supabase
        .from("books")
        .update({ genres: (b.genres ?? []).map((g) => (g === oldName ? newName : g)) })
        .eq("id", b.id)
        .eq("user_id", user!.id),
    );
    const results = await Promise.all(updates);
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      logError("settings.renameGenre", "Some updates failed", failed[0].error);
      toast.error("Couldn't rename genre. Please try again.");
      return;
    }
    toast.success(`Renamed "${oldName}" → "${newName}"`);
    invalidate();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const genre = deleteTarget;
    setDeleteTarget(null);
    const affected = books.filter((b) => (b.genres ?? []).includes(genre));
    const updates = affected.map((b) =>
      supabase
        .from("books")
        .update({ genres: (b.genres ?? []).filter((g) => g !== genre) })
        .eq("id", b.id)
        .eq("user_id", user!.id),
    );
    const results = await Promise.all(updates);
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      logError("settings.deleteGenre", "Some updates failed", failed[0].error);
      toast.error("Couldn't delete genre. Please try again.");
      return;
    }
    toast.success(`Deleted "${genre}" from all books`);
    invalidate();
  };

  return (
    <div className="space-y-8 max-w-lg">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* ── Genres ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-medium">Genres</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage genres across your library. Renaming or deleting a genre updates every book that uses it.
        </p>
        <div className="rounded-lg border divide-y">
          {isLoading ? (
            <p className="px-4 py-6 text-sm text-center text-muted-foreground">Loading…</p>
          ) : genreMap.size === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-muted-foreground">
              No genres yet. Add genres to your books to manage them here.
            </p>
          ) : (
            [...genreMap.entries()].map(([genre, count]) => (
              <div key={genre} className="px-4">
                <GenreRow
                  genre={genre}
                  count={count}
                  onRename={handleRename}
                  onDelete={setDeleteTarget}
                />
              </div>
            ))
          )}
        </div>
      </section>

      <Separator />

      {/* ── Account ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-medium">Account</h2>
        </div>
        <div className="rounded-lg border divide-y">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm font-mono truncate max-w-50">{user?.email}</span>
          </div>
          <div className="px-4 py-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </Button>
          </div>
        </div>
      </section>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the genre from{" "}
              <strong>{deleteTarget ? (genreMap.get(deleteTarget) ?? 0) : 0}</strong>{" "}
              book{(genreMap.get(deleteTarget ?? "") ?? 0) !== 1 ? "s" : ""}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
