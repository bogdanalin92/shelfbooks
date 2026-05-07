export type BookHit = {
  isbn: string | null;
  title: string;
  authors: string[];
  cover_url: string | null;
  published_year: number | null;
};

const coverUrl = (id: number | string | null | undefined, size: "S" | "M" | "L" = "M") =>
  id ? `https://covers.openlibrary.org/b/id/${id}-${size}.jpg` : null;

const coverByIsbn = (isbn: string, size: "S" | "M" | "L" = "M") =>
  `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg`;

export async function lookupByIsbn(isbn: string): Promise<BookHit | null> {
  const clean = isbn.replace(/[^0-9Xx]/g, "");
  if (!clean) return null;
  const res = await fetch(`https://openlibrary.org/isbn/${clean}.json`);
  if (!res.ok) {
    // fallback to search
    return searchOne(clean);
  }
  const data = await res.json();
  const authors: string[] = [];
  if (Array.isArray(data.authors)) {
    for (const a of data.authors) {
      if (a?.key) {
        try {
          const ar = await fetch(`https://openlibrary.org${a.key}.json`);
          if (ar.ok) {
            const aj = await ar.json();
            if (aj.name) authors.push(aj.name);
          }
        } catch {}
      }
    }
  }
  const coverId = data.covers?.[0];
  return {
    isbn: clean,
    title: data.title ?? "Untitled",
    authors,
    cover_url: coverUrl(coverId) ?? coverByIsbn(clean),
    published_year: data.publish_date ? parseInt(String(data.publish_date).match(/\d{4}/)?.[0] ?? "") || null : null,
  };
}

async function searchOne(q: string): Promise<BookHit | null> {
  const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=1`);
  if (!r.ok) return null;
  const j = await r.json();
  const d = j.docs?.[0];
  if (!d) return null;
  return {
    isbn: d.isbn?.[0] ?? null,
    title: d.title,
    authors: d.author_name ?? [],
    cover_url: d.cover_i ? coverUrl(d.cover_i) : d.isbn?.[0] ? coverByIsbn(d.isbn[0]) : null,
    published_year: d.first_publish_year ?? null,
  };
}

export async function searchBooks(q: string, limit = 20): Promise<BookHit[]> {
  if (!q.trim()) return [];
  const r = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}`
  );
  if (!r.ok) return [];
  const j = await r.json();
  return (j.docs ?? []).map((d: any) => ({
    isbn: d.isbn?.[0] ?? null,
    title: d.title,
    authors: d.author_name ?? [],
    cover_url: d.cover_i ? coverUrl(d.cover_i) : d.isbn?.[0] ? coverByIsbn(d.isbn[0]) : null,
    published_year: d.first_publish_year ?? null,
  }));
}
