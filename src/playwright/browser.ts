import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { PLAYWRIGHT_NAVIGATION_TIMEOUT_MS, PLAYWRIGHT_TIMEOUT_MS } from "../utils/constants";

export async function createBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
  });
}

export async function createContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    ignoreHTTPSErrors: false,
    viewport: { width: 1440, height: 1200 },
  });
}

export async function createPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(PLAYWRIGHT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(PLAYWRIGHT_NAVIGATION_TIMEOUT_MS);
  return page;
}

