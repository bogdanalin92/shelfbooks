import { NextResponse } from "next/server";
import { searchGoodreadsGenres } from "@/lib/goodreads";

export async function POST(request: Request): Promise<NextResponse> {
  let body: { isbn?: string | null; title?: string; authors?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { isbn = null, title = "", authors = [] } = body;

  const genres = await searchGoodreadsGenres({ isbn: isbn ?? null, title, authors });
  return NextResponse.json(genres);
}
