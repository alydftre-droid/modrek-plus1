export type LibraryBookAccessResult =
  | { ok: true; book: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export async function getAccessibleLibraryBook(
  admin: any,
  bookId: string,
  userId: string,
  select = "id,title,subject_name_ar,status,access_tier,page_count",
): Promise<LibraryBookAccessResult> {
  const { data: book, error } = await admin
    .from("library_books")
    .select(select)
    .eq("id", bookId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message || "book_lookup_failed" };
  if (!book) return { ok: false, status: 404, error: "book_not_found" };
  if (book.status !== "ready") return { ok: false, status: 403, error: "not_ready" };
  if (book.access_tier === "free") return { ok: true, book };

  const { data: allowed, error: accessError } = await admin.rpc("has_library_access", {
    _user_id: userId,
    _tier: book.access_tier,
  });
  if (accessError) return { ok: false, status: 500, error: accessError.message || "access_check_failed" };
  return allowed === true ? { ok: true, book } : { ok: false, status: 403, error: "not_accessible" };
}

export function postgrestIlikeTokens(input: string, minLength = 2, maxTokens = 5): string[] {
  return String(input || "")
    .split(/\s+/)
    .map((token) => token.replace(/[%_,()"'\\]/g, "").trim())
    .filter((token) => token.length >= minLength)
    .slice(0, maxTokens);
}