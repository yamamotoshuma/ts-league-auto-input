import type { OrderMadeSecrets, SourcePreview } from "../domain/types";
import type { Page } from "playwright";
import { buildSourcePreview } from "../domain/sourceParser";
import { ORDER_MADE_LOGIN_SELECTORS } from "../utils/constants";
import { extractPageTables } from "./pageExtraction";

export async function ensureOrderMadeLogin(page: Page, secrets: OrderMadeSecrets): Promise<void> {
  const loginSelector = ORDER_MADE_LOGIN_SELECTORS.join(", ");
  const isLoginPage = (await page.locator(loginSelector).count()) > 0;
  if (!isLoginPage) {
    return;
  }

  const form = page.locator(loginSelector).first();
  await form.locator('input[name="email"]').fill(secrets.username);
  await form.locator('input[name="password"]').fill(secrets.password);
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    form.locator('button[type="submit"], input[type="submit"]').first().click(),
  ]);

  if ((await page.locator(loginSelector).count()) > 0) {
    throw new Error("Order Made login failed");
  }
}

export async function openOrderMadeGame(page: Page, gameUrl: string, secrets: OrderMadeSecrets): Promise<SourcePreview> {
  await page.goto(gameUrl, { waitUntil: "domcontentloaded" });
  await ensureOrderMadeLogin(page, secrets);

  if (!page.url().startsWith(gameUrl)) {
    await page.goto(gameUrl, { waitUntil: "domcontentloaded" });
  }

  await page.waitForLoadState("networkidle").catch(() => undefined);
  const snapshot = await extractPageTables(page);
  const preview = buildSourcePreview(snapshot);

  if (preview.batterStats.length === 0) {
    throw new Error("source batter stats table was not found");
  }

  return preview;
}

