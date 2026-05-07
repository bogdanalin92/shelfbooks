import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import * as zxing from "@zxing/library";
const { BarcodeFormat, DecodeHintType } = zxing;
import { AppShell } from "@/components/app-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { lookupByIsbn, searchBooks, type BookHit } from "@/lib/openlibrary";
import { toast } from "sonner";
import { Camera, Loader2, Search, ScanLine } from "lucide-react";

export const Route = createFileRoute("/add")({
  component: () => (
    <AppShell>
      <AddBook />
    </AppShell>
  ),
});

function AddBook() {
  return (
    <Tabs defaultValue="scan" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="scan"><ScanLine className="h-4 w-4 mr-1"/>Scan</TabsTrigger>
        <TabsTrigger value="search"><Search className="h-4 w-4 mr-1"/>Search</TabsTrigger>
        <TabsTrigger value="manual">ISBN</TabsTrigger>
      </TabsList>
      <TabsContent value="scan"><ScanTab /></TabsContent>
      <TabsContent value="search"><SearchTab /></TabsContent>
      <TabsContent value="manual"><ManualTab /></TabsContent>
    </Tabs>
  );
}

function ScanTab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hit, setHit] = useState<BookHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFoundIsbn, setNotFoundIsbn] = useState<string | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const stop = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  };

  const start = async () => {
    setError(null);
    setHit(null);
    setNotFoundIsbn(null);
    setScanning(true);
    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
      ]);
      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        async (result) => {
          if (!result) return;
          const text = result.getText();
          stop();
          setLoading(true);
          try {
            const book = await lookupByIsbn(text);
            if (!book) {
              setNotFoundIsbn(text);
            } else {
              setHit(book);
            }
          } finally {
            setLoading(false);
          }
        }
      );
      controlsRef.current = controls;
    } catch (e: any) {
      setError(e?.message ?? "Camera unavailable");
      setScanning(false);
    }
  };

  useEffect(() => () => stop(), []);

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="aspect-[4/3] overflow-hidden rounded-md bg-black relative">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          {!scanning && (
            <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
              Camera off
            </div>
          )}
        </div>
        {!scanning ? (
          <Button onClick={start} className="w-full">
            <Camera className="h-4 w-4 mr-1" /> Start camera
          </Button>
        ) : (
          <Button onClick={stop} variant="outline" className="w-full">
            Stop
          </Button>
        )}
        <p className="text-xs text-muted-foreground text-center">
          Point at the barcode on the back of the book.
        </p>
      </Card>
      {loading && <p className="text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-1"/>Looking up…</p>}
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
      {notFoundIsbn && !hit && (
        <ManualEntry isbn={notFoundIsbn} onCancel={() => setNotFoundIsbn(null)} onPicked={(h) => { setHit(h); setNotFoundIsbn(null); }} />
      )}
      {hit && <BookPreview hit={hit} onSaved={() => setHit(null)} />}
    </div>
  );
}

function SearchTab() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<BookHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<BookHit | null>(null);

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setPicked(null);
    try {
      setResults(await searchBooks(q));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={onSearch} className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Title, author, keyword…"
        />
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}
        </Button>
      </form>

      {picked ? (
        <BookPreview hit={picked} onSaved={() => setPicked(null)} />
      ) : (
        <ul className="space-y-2">
          {results.map((r, i) => (
            <li key={i}>
              <button
                onClick={() => setPicked(r)}
                className="flex w-full gap-3 text-left rounded-md border p-2 hover:bg-accent"
              >
                <div className="h-20 w-14 flex-shrink-0 overflow-hidden rounded bg-muted">
                  {r.cover_url && (
                    <img src={r.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium line-clamp-2 text-sm">{r.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{r.authors.join(", ")}</p>
                  {r.published_year && (
                    <p className="text-xs text-muted-foreground">{r.published_year}</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ManualTab() {
  const [isbn, setIsbn] = useState("");
  const [hit, setHit] = useState<BookHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);

  const onLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotFound(null);
    setHit(null);
    try {
      const b = await lookupByIsbn(isbn);
      if (!b) setNotFound(isbn.replace(/[^0-9Xx]/g, ""));
      else setHit(b);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={onLookup} className="space-y-2">
        <Label htmlFor="isbn">ISBN</Label>
        <div className="flex gap-2">
          <Input
            id="isbn"
            inputMode="numeric"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder="9780000000000"
          />
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : "Find"}
          </Button>
        </div>
      </form>
      {notFound && !hit && (
        <ManualEntry isbn={notFound} onCancel={() => setNotFound(null)} onPicked={(h) => { setHit(h); setNotFound(null); }} />
      )}
      {hit && <BookPreview hit={hit} onSaved={() => setHit(null)} />}
    </div>
  );
}

function ManualEntry({ isbn, onPicked, onCancel }: { isbn: string; onPicked: (h: BookHit) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [year, setYear] = useState("");
  const [coverUrl, setCoverUrl] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onPicked({
      isbn: isbn || null,
      title: title.trim(),
      authors: authors.split(",").map((s) => s.trim()).filter(Boolean),
      cover_url: coverUrl.trim() || null,
      published_year: year ? parseInt(year) || null : null,
    });
  };

  return (
    <Card className="p-3 space-y-2">
      <p className="text-sm">
        No book found for ISBN <span className="font-mono">{isbn}</span>. Enter details manually:
      </p>
      <form onSubmit={submit} className="space-y-2">
        <div>
          <Label htmlFor="m-title">Title *</Label>
          <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="m-authors">Authors (comma-separated)</Label>
          <Input id="m-authors" value={authors} onChange={(e) => setAuthors(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="m-year">Published year</Label>
          <Input id="m-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="m-cover">Cover image URL (optional)</Label>
          <Input id="m-cover" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">Continue</Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function BookPreview({ hit, onSaved }: { hit: BookHit; onSaved: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("books").insert({
      user_id: user.id,
      isbn: hit.isbn,
      title: hit.title,
      authors: hit.authors,
      cover_url: hit.cover_url,
      published_year: hit.published_year,
    });
    setSaving(false);
    if (error) {
      console.error("Save book failed:", error);
      toast.error("Couldn't save the book. Please try again.");
      return;
    }
    toast.success("Added to your library");
    onSaved();
    navigate({ to: "/" });
  };

  return (
    <Card className="p-3 flex gap-3">
      <div className="h-28 w-20 flex-shrink-0 overflow-hidden rounded bg-muted">
        {hit.cover_url && <img src={hit.cover_url} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <p className="font-semibold line-clamp-2">{hit.title}</p>
        <p className="text-sm text-muted-foreground line-clamp-1">{hit.authors.join(", ")}</p>
        {hit.published_year && (
          <p className="text-xs text-muted-foreground">{hit.published_year}</p>
        )}
        {hit.isbn && <p className="text-xs text-muted-foreground">ISBN {hit.isbn}</p>}
        <Button onClick={save} disabled={saving} className="mt-auto self-start" size="sm">
          {saving ? "Saving…" : "Add to library"}
        </Button>
      </div>
    </Card>
  );
}
