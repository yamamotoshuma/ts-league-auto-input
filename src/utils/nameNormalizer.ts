export function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[　\s]+/g, "")
    .replace(/[・･]/g, "")
    .replace(/[()（）]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[　]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLooseKey(value: string): string {
  return normalizeText(value).toLowerCase();
}

