import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { Trash2, ArrowLeft, Pencil, Loader2 } from "lucide-react";
import { logError } from "@/lib/logger";

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
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("books")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setBook(data));
  }, [id]);

  if (book === undefined) return <p className="text-center text-muted-foreground py-12">Loading…</p>;
  if (!book) return <p className="text-center text-muted-foreground py-12">Book not found.</p>;

  const updateStatus = async (status: Status) => {
    const { error } = await supabase.from("books").update({ status }).eq("id", book.id);
    if (error) {
      logError("book.updateStatus", error.message, error);
      return toast.error("Couldn't update the book. Please try again.");
    }
    setBook({ ...book, status });
    toast.success("Updated");
  };

  const remove = async () => {
    if (!confirm("Remove this book from your library?")) return;
    const { error } = await supabase.from("books").delete().eq("id", book.id);
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
        <div className="h-44 w-32 flex-shrink-0 overflow-hidden rounded bg-muted">
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
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3 w-3 mr-1" /> Edit details
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <p className="text-sm font-medium">Reading status</p>
        <Select value={book.status} onValueChange={(v) => updateStatus(v as Status)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="to_read">To read</SelectItem>
            <SelectItem value="reading">Reading</SelectItem>
            <SelectItem value="finished">Finished</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Button variant="destructive" onClick={remove} className="w-full">
        <Trash2 className="h-4 w-4 mr-1" /> Remove from library
      </Button>

      <EditModal
        book={book}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => { setBook(updated); setEditOpen(false); }}
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
  const [status, setStatus] = useState<Status>(book.status);
  const [saving, setSaving] = useState(false);

  // Reset form when book changes
  useEffect(() => {
    setTitle(book.title);
    setAuthors(book.authors.join(", "));
    setIsbn(book.isbn ?? "");
    setYear(book.published_year?.toString() ?? "");
    setCoverUrl(book.cover_url ?? "");
    setStatus(book.status);
  }, [book]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const updates = {
      title: title.trim(),
      authors: authors.split(",").map((s) => s.trim()).filter(Boolean),
      isbn: isbn.trim() || null,
      published_year: year ? parseInt(year) || null : null,
      cover_url: coverUrl.trim() || null,
      status,
    };
    const { data, error } = await supabase
      .from("books")
      .update(updates)
      .eq("id", book.id)
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
            <Label htmlFor="e-authors">Authors <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
            <Input id="e-authors" value={authors} onChange={(e) => setAuthors(e.target.value)} placeholder="Author One, Author Two" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="e-isbn">ISBN</Label>
              <Input id="e-isbn" value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="9780000000000" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-year">Year</Label>
              <Input id="e-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2024" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-cover">Cover URL</Label>
            <Input id="e-cover" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-1">
            <Label>Reading status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="to_read">To read</SelectItem>
                <SelectItem value="reading">Reading</SelectItem>
                <SelectItem value="finished">Finished</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {coverUrl && (
            <div className="flex justify-center">
              <img src={coverUrl} alt="Cover preview" className="h-28 object-contain rounded border" onError={(e) => (e.currentTarget.style.display = "none")} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


