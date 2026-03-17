import type { JobInput } from "../domain/types";

export function resolveSourceGameUrl(input: JobInput, orderMadeBaseUrl: string): string {
  if (input.sourceUrl) {
    return input.sourceUrl;
  }

  if (!input.sourceGameId) {
    throw new Error("sourceGameId or sourceUrl is required");
  }

  const base = orderMadeBaseUrl.endsWith("/") ? orderMadeBaseUrl.slice(0, -1) : orderMadeBaseUrl;
  return `${base}/game/${input.sourceGameId}`;
}

export function makeDedupeKey(input: JobInput): string {
  return JSON.stringify({
    sourceGameId: input.sourceGameId,
    sourceUrl: input.sourceUrl,
    targetGameKey: input.targetGameKey,
    targetGameDate: input.targetGameDate,
    targetOpponent: input.targetOpponent,
    targetVenue: input.targetVenue,
  });
}

export function ensureAbsoluteUrl(href: string | null, baseUrl: string): string | null {
  if (!href) {
    return null;
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

