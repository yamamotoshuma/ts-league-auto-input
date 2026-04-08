import { type Browser, type BrowserContext, type Page } from "playwright";
import { chromium } from "playwright-extra"; // playwrightからではなくこちらからインポート
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import path from "path";
import { PLAYWRIGHT_NAVIGATION_TIMEOUT_MS, PLAYWRIGHT_TIMEOUT_MS } from "../utils/constants";

// Stealthプラグインを登録
chromium.use(stealthPlugin());

export async function createBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ]
  });
}

export async function createContext(browser: Browser): Promise<BrowserContext> {
  // プロファイル（Cookieやセッション）の保存先を指定
  // これにより、一度手動で解いたreCAPTCHAの「信頼度」が次回の実行に引き継がれます
  const userDataDir = path.join(process.cwd(), ".user_data");

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      // 余計なBotフラグを立てないための追加オプション
      '--disable-infobars',
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1440, height: 1200 },
    // リクエストヘッダーも日本語ユーザーを装う
    extraHTTPHeaders: {
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    }
  });

  // Stealthプラグインがカバーしきれない微細な調整
  await context.addInitScript(`
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  `);

  return context;
}

export async function createPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(PLAYWRIGHT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(PLAYWRIGHT_NAVIGATION_TIMEOUT_MS);
  return page;
}

