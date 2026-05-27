import { NextResponse } from "next/server";
import { fetchGoodreadsBookByUrl } from "@/lib/goodreads";

export async function POST(request: Request): Promise<NextResponse> {
  let url: string;
  try {
    const body = await request.json();
    url = body?.url;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json(
      { error: "Please provide a valid Goodreads book URL" },
      { status: 400 },
    );
  }

  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("goodreads.com")) {
    return NextResponse.json(
      { error: "Please provide a valid Goodreads book URL" },
      { status: 400 },
    );
  }

  try {
    const book = await fetchGoodreadsBookByUrl(url);
    return NextResponse.json(book);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch Goodreads page";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
