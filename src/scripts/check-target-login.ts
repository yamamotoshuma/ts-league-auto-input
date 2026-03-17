import { loadSecrets } from "../infra/secrets";
import { createBrowser, createContext, createPage } from "../playwright/browser";

async function main() {
  const secrets = await loadSecrets(process.cwd());
  const browser = await createBrowser();

  try {
    const context = await createContext(browser);
    const page = await createPage(context);
    await page.goto(secrets.tsLeague.loginUrl, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="userid"]').fill(secrets.tsLeague.username);
    await page.locator('input[name="password"]').fill(secrets.tsLeague.password);
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      page.locator('input[type="submit"], button[type="submit"]').first().click(),
    ]);
    console.log(JSON.stringify({ url: page.url(), title: await page.title() }, null, 2));
  } finally {
    await browser.close();
  }
}

void main();

