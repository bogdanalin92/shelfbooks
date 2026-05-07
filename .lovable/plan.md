Personal Book Library — Plan

A mobile-first installable web app to catalog physical books. Each user has a private library, can add books by ISBN barcode scan, by name, or by manual ISBN, and track reading status.

## Core features

1. **Auth** — Email/password + Google sign-in via Lovable Cloud. Each user sees only their own books (RLS).
2. **Add a book** — three ways:
  - Scan ISBN barcode with phone camera
  - Search by title/author (Open Library API)
  - Type ISBN manually
   Selected book is fetched from Open Library, then saved to the user's library.
3. **My Library** — grid/list of saved books with cover, title, author. Filter by reading status. Tap a book to view details, edit status, or remove.
4. **Reading status** — `to-read` / `reading` / `finished`, editable per book.
5. **Installable PWA** — manifest + icons so the user can "Add to Home Screen" on Android and iOS and launch it like a native app. No service worker / offline cache (avoids preview issues).

## Pages

- `/login` — sign in / sign up
- `/` (protected) — My Library (list of saved books, filter by status, "+ Add" button)
- `/add` (protected) — Add book flow with three tabs: Scan, Search, Manual ISBN
- `/book/$id` (protected) — book detail + edit status + delete

## Data model (Supabase)

`books` table:

- `id` uuid pk
- `user_id` uuid → auth.users (RLS: own rows only)
- `isbn` text
- `title` text
- `authors` text[]
- `cover_url` text
- `published_year` int
- `status` enum: `to_read` | `reading` | `finished` (default `to_read`)
- `created_at` timestamptz

RLS: SELECT/INSERT/UPDATE/DELETE only when `user_id = auth.uid()`.

## Technical details

- **Book metadata**: Open Library API (`https://openlibrary.org/isbn/{isbn}.json` and `/search.json?q=`). Free, no API key. Covers via `covers.openlibrary.org`.
- **Barcode scanning**: `@zxing/browser` library — uses `getUserMedia` to access the camera and decode EAN-13 (ISBN) barcodes directly in the browser. Works on Android Chrome and iOS Safari 16.4+. Requires HTTPS (Lovable preview/published URLs are HTTPS).
- **PWA**: `public/manifest.json` with app name, icons (192/512), `display: "standalone"`, theme colors. Linked from `__root.tsx` head. No service worker.
- **Stack**: TanStack Start routes, Lovable Cloud auth + Postgres, server functions for book queries, browser Supabase client for auth.

## Out of scope (can add later)

- Cover-image AI recognition
- Lending tracker, location, ratings, notes
- Native Capacitor wrapper for app stores
- Offline support

## Note on iOS camera

Barcode scanning requires camera permission. iOS only allows it from Safari or an installed PWA — not from in-app browsers (Instagram, Facebook). I'll show a clear permission prompt and a manual ISBN fallback.