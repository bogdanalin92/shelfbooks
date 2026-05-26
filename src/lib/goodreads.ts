import { createServerFn } from "@tanstack/react-start";
import type { BookHit } from "./openlibrary";

function extractMeta(html: string, property: string): string | null {
  const m =
    html.match(
      new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    ) ??
    html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
    );
  return m ? m[1] : null;
}

function extractLdJson(html: string): Record<string, unknown> | null {
  const matches = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const m of matches) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      const book = items.find((x) => x["@type"] === "Book" || x["@type"]?.includes?.("Book"));
      if (book) return book;
    } catch {
      // noop — malformed JSON-LD blocks are silently skipped
    }
  }
  return null;
}

/** Extract genres from Goodreads' Next.js Apollo cache embedded in __NEXT_DATA__ */
function extractGenresFromNextData(html: string): string[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return [];
  try {
    const json = JSON.parse(m[1]);
    const genres: string[] = [];
    // Walk the entire Apollo cache looking for Genre name entries
    const walk = (obj: unknown) => {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) { obj.forEach(walk); return; }
      const o = obj as Record<string, unknown>;
      // Pattern: {"__typename":"BookGenre","genre":{"__typename":"Genre","name":"Fiction"}}
      if (o.__typename === "BookGenre" && o.genre && typeof o.genre === "object") {
        const g = o.genre as Record<string, unknown>;
        if (typeof g.name === "string" && g.name) genres.push(g.name);
      }
      // Pattern: {"__typename":"Genre","name":"Fiction"}
      if (o.__typename === "Genre" && typeof o.name === "string" && o.name) {
        genres.push(o.name);
      }
      Object.values(o).forEach(walk);
    };
    walk(json);
    // Deduplicate and return top 8
    return [...new Set(genres)].slice(0, 8);
  } catch {
    return [];
  }
}

/** Extract genre slugs from /genres/ href links as a last resort */
function extractGenresFromLinks(html: string): string[] {
  const matches = [...html.matchAll(/href="\/genres\/([a-z0-9][a-z0-9-]*)"/gi)];
  const seen = new Set<string>();
  const genres: string[] = [];
  for (const m of matches) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    // Convert slug to title case: "magical-realism" -> "Magical Realism"
    genres.push(slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
    if (genres.length >= 8) break;
  }
  return genres;
}

function extractIsbn(html: string): string | null {
  // Look for ISBN-13 patterns in the page
  const m = html.match(/(?:ISBN|isbn)[:\s]*([0-9]{13})/);
  if (m) return m[1];
  const m2 = html.match(/\b97[89][0-9]{10}\b/);
  return m2 ? m2[0] : null;
}

const GOODREADS_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

function parseGoodreadsHtml(html: string): BookHit {
  type LdAuthorEntry = { name?: string } | string;

  const ld = extractLdJson(html);
  if (ld) {
    const rawAuthor = ld.author as LdAuthorEntry | LdAuthorEntry[] | null | undefined;
    const authors: string[] = rawAuthor
      ? Array.isArray(rawAuthor)
        ? rawAuthor
            .map((a) => (typeof a === "object" && a !== null ? (a.name ?? "") : a))
            .filter(Boolean)
        : [
            typeof rawAuthor === "object" && rawAuthor !== null
              ? (rawAuthor.name ?? "")
              : rawAuthor,
          ].filter(Boolean)
      : [];
    const isbn = (ld.isbn as string | null | undefined) ?? extractIsbn(html) ?? null;
    const cover = (ld.image as string | null | undefined) ?? extractMeta(html, "og:image") ?? null;
    const yearStr =
      (ld.datePublished as string | null | undefined) ??
      (ld.copyrightYear as string | null | undefined) ??
      null;
    const rawGenre = ld.genre as string | string[] | null | undefined;
    const ldGenres: string[] = rawGenre
      ? (Array.isArray(rawGenre) ? rawGenre : [rawGenre]).filter(Boolean).slice(0, 8)
      : [];
    // Supplement JSON-LD genres with Next.js data and href links
    const nextGenres = extractGenresFromNextData(html);
    const linkGenres = extractGenresFromLinks(html);
    const genres = ldGenres.length
      ? ldGenres
      : nextGenres.length
        ? nextGenres
        : linkGenres.slice(0, 8);
    return {
      isbn,
      title: (ld.name as string | undefined) ?? (ld.title as string | undefined) ?? "Untitled",
      authors,
      cover_url: cover,
      published_year: yearStr ? parseInt(String(yearStr).match(/\d{4}/)?.[0] ?? "") || null : null,
      genres,
    };
  }

  const title = extractMeta(html, "og:title");
  if (!title) throw new Error("Could not extract book data from this Goodreads page");

  const cover = extractMeta(html, "og:image");
  const descMatch = html.match(/by\s+<[^>]+>([^<]+)<\/[^>]+>/i);
  const authors = descMatch ? [descMatch[1].trim()] : [];
  const isbn = extractIsbn(html);
  const nextGenres = extractGenresFromNextData(html);
  const linkGenres = extractGenresFromLinks(html);

  return {
    isbn,
    title: title.replace(/ by .+$/, "").trim(),
    authors,
    cover_url: cover ?? null,
    published_year: null,
    genres: nextGenres.length ? nextGenres : linkGenres,
  };
}

export const fetchGoodreadsBook = createServerFn({ method: "GET" })
  .inputValidator((url: unknown) => {
    if (typeof url !== "string") throw new Error("Please provide a valid Goodreads book URL");
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Please provide a valid Goodreads book URL");
    }
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("goodreads.com")) {
      throw new Error("Please provide a valid Goodreads book URL");
    }
    return url;
  })
  .handler(async ({ data: url }): Promise<BookHit> => {
    const res = await fetch(url, { headers: GOODREADS_HEADERS, redirect: "follow" });
    if (!res.ok) throw new Error(`Goodreads returned ${res.status}`);
    return parseGoodreadsHtml(await res.text());
  });

export const lookupGoodreadsByIsbn = createServerFn({ method: "GET" })
  .inputValidator((isbn: unknown) => {
    if (typeof isbn !== "string") throw new Error("Invalid ISBN");
    return isbn.replace(/[^0-9Xx]/g, "");
  })
  .handler(async ({ data: isbn }): Promise<BookHit | null> => {
    try {
      const res = await fetch(`https://www.goodreads.com/book/isbn/${isbn}`, {
        headers: GOODREADS_HEADERS,
        redirect: "follow",
      });
      if (!res.ok) return null;
      return parseGoodreadsHtml(await res.text());
    } catch {
      return null;
    }
  });

export const searchGoodreadsGenres = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const i = input as { isbn: string | null; title: string; authors: string[] };
    return i;
  })
  .handler(async ({ data }): Promise<string[]> => {
    const { isbn, title, authors } = data;
    try {
      // 1. Try ISBN lookup
      if (isbn) {
        const clean = isbn.replace(/[^0-9Xx]/g, "");
        if (clean) {
          const res = await fetch(`https://www.goodreads.com/book/isbn/${clean}`, {
            headers: GOODREADS_HEADERS,
            redirect: "follow",
          });
          if (res.ok) {
            const hit = parseGoodreadsHtml(await res.text());
            if (hit.genres.length) return hit.genres;
          }
        }
      }
      // 2. Search by title + first author, then fall back to author alone
      const queries = [
        [title, authors[0]].filter(Boolean).join(" "),
        authors[0] ?? "",
      ].filter(Boolean);
      for (const q of queries) {
        const searchRes = await fetch(
          `https://www.goodreads.com/search?q=${encodeURIComponent(q)}&search_type=books`,
          { headers: GOODREADS_HEADERS, redirect: "follow" },
        );
        if (!searchRes.ok) continue;
        const searchHtml = await searchRes.text();
        // Extract first book URL from search results
        const m = searchHtml.match(/href="(\/book\/show\/[^"?#]+)"/);
        if (!m) continue;
        const bookRes = await fetch(`https://www.goodreads.com${m[1]}`, {
          headers: GOODREADS_HEADERS,
          redirect: "follow",
        });
        if (!bookRes.ok) continue;
        const hit = parseGoodreadsHtml(await bookRes.text());
        if (hit.genres.length) return hit.genres;
      }
    } catch {
      // network failure — silently return empty
    }
    return [];
  });
