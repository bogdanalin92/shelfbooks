import "./lib/error-capture";

import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

// ─── Static file serving ──────────────────────────────────────────────────────

// In production, __filename resolves to dist/server/server.js
// so dist/client is two levels up then into client/
const CLIENT_DIR = join(fileURLToPath(import.meta.url), "../../client");

const MIME: Record<string, string> = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function serveStatic(pathname: string): Promise<Response | null> {
  // /_build/* maps directly to dist/client/*  (Vite client base)
  const relativePath = pathname.startsWith("/_build/")
    ? pathname.slice("/_build".length)
    : pathname;

  try {
    const filePath = join(CLIENT_DIR, relativePath);
    // Prevent path traversal
    if (!filePath.startsWith(CLIENT_DIR)) return null;
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";
    // Hashed assets get long-lived cache; public files get short cache
    const isHashed = pathname.startsWith("/_build/");
    const cacheControl = isHashed ? "public, max-age=31536000, immutable" : "public, max-age=3600";
    return new Response(data, {
      headers: { "content-type": contentType, "cache-control": cacheControl },
    });
  } catch {
    return null;
  }
}

// ─── App handler (TanStack Start SSR) ────────────────────────────────────────

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }
  if (!payload || Array.isArray(payload) || typeof payload !== "object") return false;
  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) return false;
  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;
  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) return response;
  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

async function appFetch(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Serve static assets first (JS/CSS chunks and public files)
  const staticResponse = await serveStatic(url.pathname);
  if (staticResponse) return staticResponse;

  // Fall through to SSR
  try {
    const handler = await getServerEntry();
    const response = await handler.fetch(request, {}, {});
    return await normalizeCatastrophicSsrResponse(response);
  } catch (error) {
    console.error(error);
    return brandedErrorResponse();
  }
}

// ─── Node.js HTTP server (production) ────────────────────────────────────────

if (process.env.NODE_ENV === "production") {
  const { serve } = await import("srvx/node");
  const port = Number(process.env.PORT) || 3000;
  serve({ fetch: appFetch, port });
}

// ─── Web-API export (generic / Cloudflare fallback) ──────────────────────────
export default { fetch: appFetch };
