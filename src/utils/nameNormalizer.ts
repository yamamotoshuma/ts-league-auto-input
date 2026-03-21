const NAME_ALIAS_GROUPS = [
  ["いわもん", "岩本"],
];

export function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[　\s]+/g, "")
    .replace(/[・･]/g, "")
    .replace(/[()（）]/g, "")
    .trim()
    .toLowerCase();
}

export function expandNameCandidates(value: string): string[] {
  const normalized = normalizeName(value);
  if (normalized === "") {
    return [];
  }

  const expanded = new Set([normalized]);
  for (const group of NAME_ALIAS_GROUPS) {
    const normalizedGroup = group.map((entry) => normalizeName(entry));
    if (!normalizedGroup.includes(normalized)) {
      continue;
    }

    for (const candidate of normalizedGroup) {
      expanded.add(candidate);
    }
  }

  return Array.from(expanded);
}

export function namesLooselyMatch(left: string, right: string): boolean {
  const leftCandidates = expandNameCandidates(left);
  const rightCandidates = expandNameCandidates(right);
  return leftCandidates.some((leftCandidate) =>
    rightCandidates.some(
      (rightCandidate) =>
        leftCandidate === rightCandidate ||
        leftCandidate.includes(rightCandidate) ||
        rightCandidate.includes(leftCandidate),
    ),
  );
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
