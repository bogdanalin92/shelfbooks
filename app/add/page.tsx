"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
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
import { lookupByIsbn, searchBooks, fetchGenresForBook, type BookHit } from "@/lib/openlibrary";
import { logError } from "@/lib/logger";
import { isValidCoverUrl } from "@/lib/utils";
import { toast } from "sonner";
import { Camera, CameraOff, Loader2, Search, ScanLine, Sparkles } from "lucide-react";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Book = Tables<"books">;
type BookInsert = TablesInsert<"books">;

export default function AddPage() {
  return (
    <AppShell>
      <AddBook />
    </AppShell>
  );
}

function AddBook() {
  return (
    <Tabs defaultValue="scan" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="scan">
          <ScanLine className="h-4 w-4 mr-1" />
          Scan
        </TabsTrigger>
        <TabsTrigger value="search">
          <Search className="h-4 w-4 mr-1" />
          Search
        </TabsTrigger>

        <TabsTrigger value="manual">ISBN</TabsTrigger>
      </TabsList>
      <TabsContent value="scan">
        <ScanTab />
      </TabsContent>
      <TabsContent value="search">
        <SearchTab />
      </TabsContent>

      <TabsContent value="manual">
        <ManualTab />
      </TabsContent>
    </Tabs>
  );
}

function ScanTab() {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hit, setHit] = useState<BookHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<"isbn">("isbn");
  const [scannedIsbn, setScannedIsbn] = useState<string | null>(null);
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
    setScannedIsbn(null);
    setScanning(true);
    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        videoRef.current!,
        async (result) => {
          if (!result) return;
          const text = result.getText();
          stop();
          setScannedIsbn(text);
          setLoadingStage("isbn");
          setLoading(true);
          try {
            // 1. Check the user's own library first
            if (user) {
              const { data: own } = await supabase
                .from("books")
                .select("isbn, title, authors, cover_url, published_year, genres")
                .eq("user_id", user.id)
                .eq("isbn", text)
                .maybeSingle();
              if (own) {
                setHit({
                  isbn: own.isbn,
                  title: own.title,
                  authors: own.authors,
                  cover_url: own.cover_url,
                  published_year: own.published_year,
                  genres: own.genres,
                });
                return;
              }
            }
            // 2. Try OpenLibrary
            const book = await lookupByIsbn(text);
            if (book) {
              setHit(book);
            } else {
              setNotFoundIsbn(text);
            }
          } finally {
            setLoading(false);
          }
        },
      );
      controlsRef.current = controls;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Camera unavailable");
      setScanning(false);
    }
  };

  useEffect(() => () => stop(), []);

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="aspect-4/3 overflow-hidden rounded-md bg-black relative">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          {!scanning && (
            <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
              Camera off
            </div>
          )}
          {scanning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-4/5 h-16 border-2 border-primary rounded opacity-80">
                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-primary/60" />
              </div>
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
      {loading && (
        <p className="text-center text-sm text-muted-foreground">
          <Loader2 className="inline h-4 w-4 animate-spin mr-1" />
          Searching for the{" "}
          <span className="font-mono font-medium text-foreground">{scannedIsbn}</span> ISBN…
        </p>
      )}
      {error && (
        <Card className="p-6 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <CameraOff className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-sm">Camera unavailable</p>
            <p className="text-xs text-muted-foreground">
              {error.toLowerCase().includes("permission") || error.toLowerCase().includes("allowed")
                ? "Camera access was denied. Open your browser settings, allow camera access for this site, then try again."
                : "Could not access the camera. Make sure no other app is using it, then try again."}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              start();
            }}
          >
            <Camera className="h-4 w-4 mr-1" /> Try again
          </Button>
        </Card>
      )}
      {notFoundIsbn && !hit && (
        <ManualEntry
          isbn={notFoundIsbn}
          onCancel={() => setNotFoundIsbn(null)}
          onPicked={(h) => {
            setHit(h);
            setNotFoundIsbn(null);
          }}
        />
      )}
      {hit && (
        <BookPreview
          hit={hit}
          redirectAfterSave={false}
          onSaved={() => {
            setHit(null);
            setScannedIsbn(null);
          }}
        />
      )}
    </div>
  );
}

function SearchTab() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<BookHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [picked, setPicked] = useState<BookHit | null>(null);
  const [addingManually, setAddingManually] = useState(false);

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setPicked(null);
    setAddingManually(false);
    try {
      const hits = await searchBooks(q);
      setResults(hits);
      setSearched(true);
    } finally {
      setBusy(false);
    }
  };

  if (addingManually) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setAddingManually(false)}>
          ← Back to search
        </Button>
        <ManualEntry
          isbn=""
          onCancel={() => setAddingManually(false)}
          onPicked={(h) => {
            setPicked(h);
            setAddingManually(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSearch} className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Title, author, keyword…"
        />
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>

      {picked ? (
        <BookPreview hit={picked} onSaved={() => setPicked(null)} />
      ) : (
        <>
          {searched && results.length === 0 && !busy && (
            <div className="text-center space-y-3 py-6">
              <p className="text-sm text-muted-foreground">
                No results found for &quot;<strong>{q}</strong>&quot;.
              </p>
              <Button variant="outline" onClick={() => setAddingManually(true)}>
                Add manually
              </Button>
            </div>
          )}
          <ul className="space-y-2">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  onClick={() => setPicked(r)}
                  className="flex w-full gap-3 text-left rounded-md border p-2 hover:bg-accent"
                >
                  <div className="h-20 w-14 shrink-0 overflow-hidden rounded bg-muted">
                    {r.cover_url && (
                      <img
                        src={r.cover_url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium line-clamp-2 text-sm">{r.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {r.authors.join(", ")}
                    </p>
                    {r.published_year && (
                      <p className="text-xs text-muted-foreground">{r.published_year}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {searched && results.length > 0 && (
            <div className="text-center pt-2">
              <Button variant="ghost" size="sm" onClick={() => setAddingManually(true)}>
                Not what you&apos;re looking for? Add manually
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ManualTab() {
  const { user } = useAuth();
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
      const cleanIsbn = isbn.replace(/[^0-9Xx]/g, "");
      // 1. Check the user's own library first
      if (user) {
        const { data: own } = await supabase
          .from("books")
          .select("isbn, title, authors, cover_url, published_year, genres")
          .eq("user_id", user.id)
          .eq("isbn", cleanIsbn)
          .maybeSingle();
        if (own) {
          setHit({
            isbn: own.isbn,
            title: own.title,
            authors: own.authors,
            cover_url: own.cover_url,
            published_year: own.published_year,
            genres: own.genres,
          });
          return;
        }
      }
      // 2. Fall back to OpenLibrary
      const b = await lookupByIsbn(isbn);
      if (b) {
        setHit(b);
        return;
      }
      setNotFound(cleanIsbn);
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
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
          </Button>
        </div>
      </form>
      {notFound && !hit && (
        <ManualEntry
          isbn={notFound}
          onCancel={() => setNotFound(null)}
          onPicked={(h) => {
            setHit(h);
            setNotFound(null);
          }}
        />
      )}
      {hit && <BookPreview hit={hit} onSaved={() => setHit(null)} />}
    </div>
  );
}

function ManualEntry({
  isbn,
  onPicked,
  onCancel,
}: {
  isbn: string;
  onPicked: (h: BookHit) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [year, setYear] = useState("");
  const [coverUrl, setCoverUrl] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const cleanCoverUrl = coverUrl.trim();
    if (!isValidCoverUrl(cleanCoverUrl)) {
      toast.warning("Cover URL must use HTTPS.");
      return;
    }
    onPicked({
      isbn: isbn || null,
      title: title.trim(),
      authors: authors
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      cover_url: cleanCoverUrl || null,
      published_year: year ? parseInt(year) || null : null,
      genres: [],
    });
  };

  return (
    <Card className="p-3 space-y-2">
      {isbn && (
        <p className="text-sm">
          No book found for ISBN <span className="font-mono">{isbn}</span>. Enter details manually:
        </p>
      )}
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
          <Input
            id="m-year"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="m-cover">Cover image URL (optional)</Label>
          <Input
            id="m-cover"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Continue
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function BookPreview({
  hit,
  onSaved,
  redirectAfterSave = true,
}: {
  hit: BookHit;
  onSaved: () => void;
  redirectAfterSave?: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [existingId, setExistingId] = useState<string | null | undefined>(undefined);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set(hit.genres ?? []));
  const [suggestedGenres, setSuggestedGenres] = useState<string[] | null>(
    (hit.genres ?? []).length > 0 ? (hit.genres ?? []) : null,
  );
  const [fetchingGenres, setFetchingGenres] = useState(false);

  const fetchGenres = async () => {
    setFetchingGenres(true);
    const genres = await fetchGenresForBook(hit.isbn ?? null, hit.title, hit.authors);
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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const check = async () => {
      const dupQuery = supabase.from("books").select("id").eq("user_id", user.id);
      const { data } = await (
        hit.isbn ? dupQuery.eq("isbn", hit.isbn) : dupQuery.ilike("title", hit.title)
      ).maybeSingle();
      if (!cancelled) setExistingId(data?.id ?? null);
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [user, hit.isbn, hit.title]);

  const mutation = useMutation({
    mutationFn: async (payload: BookInsert) => {
      const { data, error } = await supabase.from("books").insert(payload).select().single();
      if (error) throw error;
      return data as Book;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["books", user?.id] });
      const previous = queryClient.getQueryData<Book[]>(["books", user?.id]);
      const optimistic: Book = {
        id: `optimistic-${Date.now()}`,
        user_id: payload.user_id,
        title: payload.title,
        authors: payload.authors ?? [],
        isbn: payload.isbn ?? null,
        cover_url: payload.cover_url ?? null,
        published_year: payload.published_year ?? null,
        status: payload.status ?? "to_read",
        notes: payload.notes ?? null,
        genres: payload.genres ?? [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      queryClient.setQueryData<Book[]>(["books", user?.id], (old) => [optimistic, ...(old ?? [])]);
      return { previous };
    },
    onError: (err, _payload, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["books", user?.id], context.previous);
      }
      logError("add.saveBook", err instanceof Error ? err.message : String(err), err);
      toast.error("Couldn't save the book. Please try again.");
    },
    onSuccess: () => {
      toast.success("Added to your library");
      onSaved();
      if (redirectAfterSave) router.push("/");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["books", user?.id] });
    },
  });

  const save = () => {
    if (!user) return;
    const rawCover = hit.cover_url ?? "";
    const payload: BookInsert = {
      user_id: user.id,
      isbn: hit.isbn ?? null,
      title: hit.title,
      authors: hit.authors,
      cover_url: isValidCoverUrl(rawCover) ? rawCover || null : null,
      published_year: hit.published_year ?? null,
      genres: Array.from(selectedGenres),
    };
    mutation.mutate(payload);
  };

  return (
    <Card className="p-3 space-y-3">
      <div className="flex gap-3">
        <div className="h-28 w-20 shrink-0 overflow-hidden rounded bg-muted">
          {hit.cover_url && (
            <img src={hit.cover_url} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <p className="font-semibold line-clamp-2">{hit.title}</p>
          <p className="text-sm text-muted-foreground line-clamp-1">{hit.authors.join(", ")}</p>
          {hit.published_year && (
            <p className="text-xs text-muted-foreground">{hit.published_year}</p>
          )}
          {hit.isbn && <p className="text-xs text-muted-foreground">ISBN {hit.isbn}</p>}
          <div className="mt-auto">
            {existingId === undefined && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {existingId !== null && existingId !== undefined && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">Already in your library</p>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/book/${existingId}`}>View</Link>
                </Button>
              </div>
            )}
            {existingId === null && (
              <Button onClick={save} disabled={mutation.isPending} size="sm">
                {mutation.isPending ? "Saving…" : "Add to library"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Genres — only shown when the book isn't already in the library */}
      {existingId === null && (
        <div className="border-t pt-2">
          {suggestedGenres !== null ? (
            suggestedGenres.length > 0 ? (
              <div className="space-y-2">
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
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() => setSuggestedGenres(null)}
                >
                  Dismiss
                </Button>
              </div>
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
            )
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
        </div>
      )}
    </Card>
  );
}
