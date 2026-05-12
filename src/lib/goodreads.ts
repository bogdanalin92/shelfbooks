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
    const isbn = ld.isbn ?? extractIsbn(html) ?? null;
    const cover = ld.image ?? extractMeta(html, "og:image") ?? null;
    const yearStr = ld.datePublished ?? ld.copyrightYear ?? null;
    return {
      isbn,
      title: ld.name ?? ld.title ?? "Untitled",
      authors,
      cover_url: cover,
      published_year: yearStr
        ? parseInt(String(yearStr).match(/\d{4}/)?.[0] ?? "") || null
        : null,
    };
  }

  const title = extractMeta(html, "og:title");
  if (!title) throw new Error("Could not extract book data from this Goodreads page");

  const cover = extractMeta(html, "og:image");
  const descMatch = html.match(/by\s+<[^>]+>([^<]+)<\/[^>]+>/i);
  const authors = descMatch ? [descMatch[1].trim()] : [];
  const isbn = extractIsbn(html);

  return {
    isbn,
    title: title.replace(/ by .+$/, "").trim(),
    authors,
    cover_url: cover ?? null,
    published_year: null,
  };
}

export const fetchGoodreadsBook = createServerFn({ method: "GET" })
  .inputValidator((url: unknown) => {
    if (typeof url !== "string" || !url.includes("goodreads.com")) {
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
