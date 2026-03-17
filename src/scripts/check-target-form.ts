import { loadSecrets } from "../infra/secrets";
import { createBrowser, createContext, createPage } from "../playwright/browser";
import { inspectTargetForm, openTargetGame } from "../playwright/tsLeagueClient";

async function main() {
  const args = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index], process.argv[index + 1] ?? "");
  }

  const targetGameKey = args.get("--target-game-key");
  if (!targetGameKey) {
    throw new Error("--target-game-key is required");
  }

  const secrets = await loadSecrets(process.cwd());
  const browser = await createBrowser();

  try {
    const context = await createContext(browser);
    const page = await createPage(context);
    await openTargetGame(page, secrets.tsLeague, {
      targetGameKey,
      targetGameDate: args.get("--target-game-date") ?? null,
      targetOpponent: args.get("--target-opponent") ?? null,
      targetVenue: args.get("--target-venue") ?? null,
    });
    const preview = await inspectTargetForm(page);
    console.log(JSON.stringify(preview, null, 2));
  } finally {
    await browser.close();
  }
}

void main();

