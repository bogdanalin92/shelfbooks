"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import type { Tables } from "@/integrations/supabase/types";
import { Trash2, ArrowLeft, Pencil, Loader2, Sparkles, X, BookOpen } from "lucide-react";
import { fetchGenresForBook } from "@/lib/openlibrary";
import { logError } from "@/lib/logger";
import { isValidCoverUrl } from "@/lib/utils";

type Book = Tables<"books">;
type Status = Book["status"];

export default function BookPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <AppShell>
      <BookDetail params={params} />
    </AppShell>
  );
}

function BookDetail({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [fetchError, setFetchError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [fetchingGenres, setFetchingGenres] = useState(false);
  const [suggestedGenres, setSuggestedGenres] = useState<string[] | null>(null);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (error) {
        logError("book.fetch", error.message, error);
        setFetchError(true);
        return;
      }
      setBook(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (book === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (book === null || fetchError) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-muted-foreground">Book not found.</p>
      </div>
    );
  }

  const updateStatus = async (status: Status) => {
    const { error } = await supabase
      .from("books")
      .update({ status })
      .eq("id", book.id)
      .eq("user_id", book.user_id);
    if (error) {
      logError("book.updateStatus", error.message, error);
      return toast.error("Couldn't update status. Please try again.");
    }
    setBook({ ...book, status });
    queryClient.invalidateQueries({ queryKey: ["books", user?.id] });
    toast.success("Updated");
  };

  const fetchGenres = async () => {
    setFetchingGenres(true);
    // Try OpenLibrary for genres
    const genres = await fetchGenresForBook(book.isbn, book.title, book.authors);
    setFetchingGenres(false);
    setSuggestedGenres(genres);
    setSelectedGenres(new Set(genres));
    if (genres.length === 0) toast.info("No genres found for this book.");
  };

  const toggleGenre = (g: string) => {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  const saveGenres = async () => {
    const genres = Array.from(selectedGenres);
    const { error } = await supabase
      .from("books")
      .update({ genres })
      .eq("id", book.id)
      .eq("user_id", book.user_id);
    if (error) {
      logError("book.saveGenres", error.message, error);
      return toast.error("Couldn't save genres. Please try again.");
    }
    setBook({ ...book, genres });
    setSuggestedGenres(null);
    setSelectedGenres(new Set());
    toast.success("Genres saved");
  };

  const remove = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("books")
      .delete()
      .eq("id", book.id)
      .eq("user_id", user.id);
    if (error) {
      logError("book.remove", error.message, error);
      return toast.error("Couldn't remove the book. Please try again.");
    }
    toast.success("Removed");
    router.push("/");
  };

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>

      {/* Hero: cover thumbnail left, title + status right */}
      <div className="flex gap-4 items-start">
        {/* Cover thumbnail */}
        <div className="w-28 shrink-0 rounded-xl overflow-hidden bg-muted/50 shadow-md aspect-2/3">
          {book.cover_url ? (
            <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <BookOpen className="h-8 w-8 opacity-30" />
            </div>
          )}
        </div>

        {/* Title, meta + status */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="space-y-0.5">
            <h1 className="text-xl font-bold leading-tight">{book.title}</h1>
            {book.authors.length > 0 && (
              <p className="text-sm text-muted-foreground">{book.authors.join(", ")}</p>
            )}
            {(book.published_year || book.isbn) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {book.published_year && <span>{book.published_year}</span>}
                {book.isbn && <span>ISBN {book.isbn}</span>}
              </div>
            )}
          </div>

          {/* Status buttons — 2×2 grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                {
                  value: "to_read",
                  label: "To read",
                  dot: "bg-blue-500",
                  active:
                    "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
                },
                {
                  value: "reading",
                  label: "Reading",
                  dot: "bg-amber-500",
                  active:
                    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
                },
                {
                  value: "finished",
                  label: "Finished",
                  dot: "bg-emerald-500",
                  active:
                    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
                },
                {
                  value: "want_to_buy",
                  label: "Want to buy",
                  dot: "bg-violet-500",
                  active:
                    "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
                },
              ] as const
            ).map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => updateStatus(s.value)}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium text-left transition-colors ${
                  book.status === s.value
                    ? s.active
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Genres */}
      {(book.genres ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {(book.genres ?? []).map((g) => (
            <span
              key={g}
              className="inline-block rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
            >
              {g}
            </span>
          ))}
        </div>
      ) : suggestedGenres !== null ? (
        <div className="space-y-2">
          {suggestedGenres.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">Select genres to add:</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedGenres.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGenre(g)}
                    className={`inline-block rounded-full px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                      selectedGenres.has(g)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveGenres} disabled={selectedGenres.size === 0}>
                  Add to book
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSuggestedGenres(null)}>
                  Dismiss
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">No genres found.</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => setSuggestedGenres(null)}
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={fetchGenres}
          disabled={fetchingGenres}
        >
          {fetchingGenres ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3 mr-1" />
          )}
          Suggest genres
        </Button>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 mr-2" /> Edit details
        </Button>
        <Button
          variant="ghost"
          className="flex-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => setRemoveOpen(true)}
        >
          <Trash2 className="h-4 w-4 mr-2" /> Remove
        </Button>
      </div>

      {/* Notes */}
      {book.notes && (
        <Card className="p-4 space-y-1">
          <p className="text-sm font-medium">Notes</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{book.notes}</p>
        </Card>
      )}

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from library?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{book.title}&quot; will be permanently removed from your library. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditModal
        book={book}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          setBook(updated);
          setEditOpen(false);
        }}
      />
    </div>
  );
}

function EditModal({
  book,
  open,
  onClose,
  onSaved,
}: {
  book: Book;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Book) => void;
}) {
  const [title, setTitle] = useState(book.title);
  const [authors, setAuthors] = useState(book.authors.join(", "));
  const [isbn, setIsbn] = useState(book.isbn ?? "");
  const [year, setYear] = useState(book.published_year?.toString() ?? "");
  const [coverUrl, setCoverUrl] = useState(book.cover_url ?? "");
  const [genreList, setGenreList] = useState<string[]>(book.genres ?? []);
  const [genreInput, setGenreInput] = useState("");
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);
  const [libraryGenres, setLibraryGenres] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>(book.status);
  const [notes, setNotes] = useState(book.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("books")
      .select("genres")
      .then(({ data }) => {
        if (data) {
          const all = [...new Set(data.flatMap((b) => b.genres ?? []))].sort();
          setLibraryGenres(all);
        }
      });
  }, []);

  useEffect(() => {
    setTitle(book.title);
    setAuthors(book.authors.join(", "));
    setIsbn(book.isbn ?? "");
    setYear(book.published_year?.toString() ?? "");
    setCoverUrl(book.cover_url ?? "");
    setGenreList(book.genres ?? []);
    setGenreInput("");
    setStatus(book.status);
    setNotes(book.notes ?? "");
  }, [book]);

  const filteredGenres = libraryGenres.filter(
    (g) => !genreList.includes(g) && g.toLowerCase().includes(genreInput.toLowerCase()),
  );

  const addGenre = (g: string) => {
    const trimmed = g.trim();
    if (trimmed && !genreList.includes(trimmed)) {
      setGenreList((prev) => [...prev, trimmed]);
    }
    setGenreInput("");
  };

  const removeGenre = (g: string) => {
    setGenreList((prev) => prev.filter((x) => x !== g));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const cleanCoverUrl = coverUrl.trim();
    if (!isValidCoverUrl(cleanCoverUrl)) {
      toast.warning("Cover URL must use HTTPS.");
      return;
    }
    setSaving(true);
    const updates = {
      title: title.trim(),
      authors: authors
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      isbn: isbn.trim() || null,
      published_year: year ? parseInt(year) || null : null,
      cover_url: cleanCoverUrl || null,
      genres: genreList,
      status,
      notes: notes.trim() || null,
    };
    const { data, error } = await supabase
      .from("books")
      .update(updates)
      .eq("id", book.id)
      .eq("user_id", book.user_id)
      .select()
      .single();
    setSaving(false);
    if (error) {
      logError("book.edit", error.message, error);
      toast.error("Couldn't save changes. Please try again.");
      return;
    }
    toast.success("Changes saved");
    onSaved(data);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit book</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="e-title">Title *</Label>
            <Input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-authors">
              Authors <span className="text-muted-foreground text-xs">(comma-separated)</span>
            </Label>
            <Input
              id="e-authors"
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder="Author One, Author Two"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="e-isbn">ISBN</Label>
              <Input
                id="e-isbn"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="9780000000000"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-year">Year</Label>
              <Input
                id="e-year"
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2024"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-cover">Cover URL</Label>
            <Input
              id="e-cover"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1">
            <Label>Genres</Label>
            {genreList.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {genreList.map((g) => (
                  <span
                    key={g}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs max-w-48"
                    title={g}
                  >
                    <span className="truncate">{g}</span>
                    <button
                      type="button"
                      onClick={() => removeGenre(g)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Input
                value={genreInput}
                onChange={(e) => {
                  setGenreInput(e.target.value);
                  setGenreDropdownOpen(true);
                }}
                onFocus={() => setGenreDropdownOpen(true)}
                onBlur={() => setTimeout(() => setGenreDropdownOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = genreInput.trim();
                    if (!val && filteredGenres.length === 0) return;
                    addGenre(
                      filteredGenres.length > 0 && !val
                        ? filteredGenres[0]
                        : val || filteredGenres[0],
                    );
                  } else if (e.key === "Escape") {
                    setGenreDropdownOpen(false);
                  }
                }}
                placeholder="Search or type a genre…"
              />
              {genreDropdownOpen && (filteredGenres.length > 0 || genreInput.trim()) && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-40 overflow-auto">
                  {filteredGenres.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent truncate"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addGenre(g);
                      }}
                    >
                      {g}
                    </button>
                  ))}
                  {genreInput.trim() &&
                    !libraryGenres
                      .map((g) => g.toLowerCase())
                      .includes(genreInput.trim().toLowerCase()) && (
                      <button
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-muted-foreground italic"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          addGenre(genreInput);
                        }}
                      >
                        Add &quot;{genreInput.trim()}&quot;
                      </button>
                    )}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Reading status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="to_read">To read</SelectItem>
                <SelectItem value="reading">Reading</SelectItem>
                <SelectItem value="finished">Finished</SelectItem>
                <SelectItem value="want_to_buy">Want to buy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-notes">Notes</Label>
            <Textarea
              id="e-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Your thoughts, quotes, review…"
              rows={3}
              className="resize-none"
            />
          </div>
          {coverUrl && (
            <div className="flex justify-center">
              <img
                src={coverUrl}
                alt="Cover preview"
                className="h-28 object-contain rounded border"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
