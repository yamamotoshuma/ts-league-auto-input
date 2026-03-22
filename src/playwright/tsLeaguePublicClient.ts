import type { Page } from "playwright";
import type { PitcherSourcePreview } from "../domain/types";
import { buildPitcherSourcePreview } from "../domain/pitcherSourceParser";
import { extractPageTables } from "./pageExtraction";

export async function openTsLeaguePublicGame(
  page: Page,
  gameUrl: string,
  targetOpponent: string | null,
): Promise<PitcherSourcePreview> {
  await page.goto(gameUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const snapshot = await extractPageTables(page);
  return buildPitcherSourcePreview(snapshot, targetOpponent);
}
