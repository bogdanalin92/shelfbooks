import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Trash2, ArrowLeft, Pencil, Loader2, Sparkles, X } from "lucide-react";
import { fetchGenresForBook } from "@/lib/openlibrary";
import { logError } from "@/lib/logger";
import { isValidCoverUrl } from "@/lib/utils";

export const Route = createFileRoute("/book/$id")({
  component: () => (
    <AppShell>
      <BookDetail />
    </AppShell>
  ),
});

type Book = Tables<"books">;
type Status = Book["status"];

function BookDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [fetchError, setFetchError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [fetchingGenres, setFetchingGenres] = useState(false);
  const [suggestedGenres, setSuggestedGenres] = useState<string[] | null>(null);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());

  useEffect(() => {
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

  if (fetchError)
    return (
      <p className="text-center text-destructive py-12">Failed to load book. Please refresh.</p>
    );
  if (book === undefined)
    return <p className="text-center text-muted-foreground py-12">Loading…</p>;
  if (!book) return <p className="text-center text-muted-foreground py-12">Book not found.</p>;

  const updateStatus = async (status: Status) => {
    if (!user) return;
    const { error } = await supabase
      .from("books")
      .update({ status })
      .eq("id", book.id)
      .eq("user_id", user.id);
    if (error) {
      logError("book.updateStatus", error.message, error);
      return toast.error("Couldn't update the book. Please try again.");
    }
    setBook({ ...book, status });
    toast.success("Updated");
  };

  const fetchGenres = async () => {
    setFetchingGenres(true);
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
    navigate({ to: "/" });
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>

      <Card className="p-4 flex gap-4">
        <div className="h-44 w-32 shrink-0 overflow-hidden rounded bg-muted">
          {book.cover_url && (
            <img src={book.cover_url} alt={book.title} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <h1 className="text-xl font-bold leading-tight">{book.title}</h1>
          {book.authors.length > 0 && (
            <p className="text-sm text-muted-foreground">{book.authors.join(", ")}</p>
          )}
          {book.published_year && (
            <p className="text-xs text-muted-foreground">{book.published_year}</p>
          )}
          {book.isbn && <p className="text-xs text-muted-foreground">ISBN {book.isbn}</p>}

          {/* Genres — show pills if present, suggestion UI if empty */}
          {(book.genres ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {(book.genres ?? []).map((g) => (
                <span
                  key={g}
                  className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {g}
                </span>
              ))}
            </div>
          ) : suggestedGenres !== null ? (
            <div className="pt-1 space-y-2">
              {suggestedGenres.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground">Select genres to add:</p>
                  <div className="flex flex-wrap gap-1">
                    {suggestedGenres.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleGenre(g)}
                        className={`inline-block rounded-full px-2 py-0.5 text-xs transition-colors cursor-pointer ${
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
                    <Button
                      size="sm"
                      onClick={saveGenres}
                      disabled={selectedGenres.size === 0}
                    >
                      Add to book
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSuggestedGenres(null)}
                    >
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
              className="mt-1 h-7 px-2 text-xs text-muted-foreground"
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

          <Button size="sm" variant="outline" className="mt-2" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3 w-3 mr-1" /> Edit details
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <p className="text-sm font-medium">Reading status</p>
        <Select value={book.status} onValueChange={(v) => updateStatus(v as Status)}>
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
      </Card>

      {/* Notes section */}
      {book.notes && (
        <Card className="p-4 space-y-1">
          <p className="text-sm font-medium">Notes</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{book.notes}</p>
        </Card>
      )}

      <Button variant="destructive" onClick={() => setRemoveOpen(true)} className="w-full">
        <Trash2 className="h-4 w-4 mr-1" /> Remove from library
      </Button>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from library?</AlertDialogTitle>
            <AlertDialogDescription>
              "{book.title}" will be permanently removed from your library. This cannot be undone.
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
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs"
                  >
                    {g}
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
                    addGenre(filteredGenres.length > 0 && !val ? filteredGenres[0] : val || filteredGenres[0]);
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
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addGenre(g);
                      }}
                    >
                      {g}
                    </button>
                  ))}
                  {genreInput.trim() && !libraryGenres.map(g => g.toLowerCase()).includes(genreInput.trim().toLowerCase()) && (
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent text-muted-foreground italic"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addGenre(genreInput);
                      }}
                    >
                      Add "{genreInput.trim()}"
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
