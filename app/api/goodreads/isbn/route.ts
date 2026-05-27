import { NextResponse } from "next/server";
import { lookupGoodreadsByIsbn } from "@/lib/goodreads";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn") ?? "";
  if (!isbn) {
    return NextResponse.json(null);
  }
  const result = await lookupGoodreadsByIsbn(isbn);
  return NextResponse.json(result);
}
