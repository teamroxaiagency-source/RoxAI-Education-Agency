/**
 * The dedup key a duplicate inbound email must reproduce exactly to be
 * merged into the same open inquiry instead of creating a new one:
 * normalized parent email + the grade they're asking about ("unspecified"
 * when extraction couldn't ground a grade). Enforced with a real unique
 * index (see 0001_schema.sql: inquiries_open_dedup_idx) scoped to open
 * statuses only, so this function and the database agree on what "the
 * same inquiry" means.
 */
export function computeDedupKey(parentEmail: string, gradeInterested: string | null): string {
  const normalizedEmail = parentEmail.trim().toLowerCase();
  const normalizedGrade = gradeInterested?.trim().toLowerCase() || "unspecified";
  return `${normalizedEmail}::${normalizedGrade}`;
}
