import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { Trash2, ArrowLeft } from "lucide-react";

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
    </div>
  );
}
