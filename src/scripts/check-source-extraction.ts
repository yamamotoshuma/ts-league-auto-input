import { join } from "node:path";
import { ArtifactStore } from "../infra/artifactStore";
import { loadSecrets } from "../infra/secrets";
import { createBrowser, createContext, createPage } from "../playwright/browser";
import { openOrderMadeGame } from "../playwright/orderMadeClient";
import { resolveSourceGameUrl } from "../utils/url";

async function main() {
  const projectRoot = process.cwd();
  const args = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index], process.argv[index + 1] ?? "");
  }

  const sourceUrl = args.get("--source-url") ?? null;
  const sourceGameId = args.get("--source-game-id") ?? null;
  const secrets = await loadSecrets(projectRoot);
  const browser = await createBrowser();

  try {
    const context = await createContext(browser);
    const page = await createPage(context);
    const preview = await openOrderMadeGame(
      page,
      resolveSourceGameUrl(
        {
          sourceGameId,
          sourceUrl,
          targetGameKey: "manual-check",
          targetGameDate: null,
          targetOpponent: null,
          targetVenue: null,
          mode: "dry-run",
        },
        secrets.orderMade.baseUrl,
      ),
      secrets.orderMade,
    );
    console.log(JSON.stringify(preview, null, 2));
  } finally {
    await browser.close();
  }
}

void main();

