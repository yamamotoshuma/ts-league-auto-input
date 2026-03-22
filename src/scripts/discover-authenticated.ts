import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadSecrets } from "../infra/secrets";
import { createBrowser, createContext, createPage } from "../playwright/browser";
import { openOrderMadeGame } from "../playwright/orderMadeClient";
import { extractPageTables } from "../playwright/pageExtraction";
import { resolveSourceGameUrl } from "../utils/url";

function argMap(argv: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let index = 2; index < argv.length; index += 2) {
    map.set(argv[index], argv[index + 1] ?? "");
  }

  return map;
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function main() {
  const args = argMap(process.argv);
  const projectRoot = process.cwd();
  const secrets = await loadSecrets(projectRoot);
  const browser = await createBrowser();
  const artifactDir = join(projectRoot, "artifacts", "live-discovery");
  await ensureDir(artifactDir);

  const sourceGameId = args.get("--source-game-id") ?? "37";
  const sourceUrl = args.get("--source-url") ?? null;
  const gameFormIndex = Number.parseInt(args.get("--target-form-index") ?? "0", 10);

  try {
    const context = await createContext(browser);
    const page = await createPage(context);

    const resolvedSourceUrl = resolveSourceGameUrl(
      {
        workflow: "batter",
        sourceGameId,
        sourceUrl,
        targetGameKey: "discovery",
        targetGameDate: null,
        targetOpponent: null,
        targetVenue: null,
        pitcherAllocationText: null,
        mode: "dry-run",
      },
      secrets.orderMade.baseUrl,
    );

    const sourcePreview = await openOrderMadeGame(page, resolvedSourceUrl, secrets.orderMade);
    const sourceSnapshot = await extractPageTables(page);
    await page.screenshot({ path: join(artifactDir, "source-game.png"), fullPage: true });

    await page.goto(secrets.tsLeague.loginUrl, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="userid"]').fill(secrets.tsLeague.username);
    await page.locator('input[name="password"]').fill(secrets.tsLeague.password);
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      page.locator('input[type="submit"],button[type="submit"]').first().click(),
    ]);
    await page.goto(secrets.tsLeague.gameListUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.screenshot({ path: join(artifactDir, "target-game-list.png"), fullPage: true });

    const gameListSummary = await page.evaluate(() => {
      return Array.from(document.forms).map((form, index) => {
        const row = form.closest("tr");
        const rowText = row ? (row.textContent ?? "").replace(/\s+/g, " ").trim() : "";
        const inputs = Array.from(form.querySelectorAll("input, select, textarea")).map((element) => {
          const input = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          return {
            tag: input.tagName.toLowerCase(),
            type: "type" in input ? input.type ?? null : null,
            name: input.getAttribute("name"),
            value: "value" in input ? input.value ?? null : null,
          };
        });

        return {
          index,
          action: form.getAttribute("action"),
          method: form.getAttribute("method"),
          rowText,
          inputs,
        };
      });
    });

    const battingFormLocator = page.locator("form[action='gameof_edit.php']").nth(gameFormIndex);
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      battingFormLocator.locator('input[type="submit"]').click(),
    ]);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.screenshot({ path: join(artifactDir, "target-batting-edit.png"), fullPage: true });

    const battingFormSummary = await page.evaluate(() => {
      const form = document.forms[0];
      const hiddenInputs = Array.from(form.querySelectorAll('input[type="hidden"]')).map((element) => ({
        name: element.getAttribute("name"),
        value: element.getAttribute("value"),
      }));
      const submitButtons = Array.from(
        form.querySelectorAll('input[type="submit"], button[type="submit"]'),
      ).map((element) => {
        const input = element as HTMLInputElement | HTMLButtonElement;
        return {
          name: input.getAttribute("name"),
          value: input instanceof HTMLButtonElement ? (input.textContent ?? "").trim() : input.value,
        };
      });

      const playerRows: Array<Record<string, unknown>> = [];
      for (let index = 1; index <= 12; index += 1) {
        const userSelect = form.querySelector(
          `select[name="MemberScoreOfUserId[${index}]"]`,
        ) as HTMLSelectElement | null;

        if (!userSelect) {
          continue;
        }

        const positionSelect = form.querySelector(
          `select[name="MemberScoreOfSyubi[${index}]"]`,
        ) as HTMLSelectElement | null;
        const inningEventValues = Array.from({ length: 9 }, (_, inningIndex) => {
          const inning = inningIndex + 1;
          const main = form.querySelector(
            `select[name="MemberScoreOf${inning}[${index}]"]`,
          ) as HTMLSelectElement | null;
          const sub = form.querySelector(
            `select[name="MemberScoreOf${inning}s[${index}]"]`,
          ) as HTMLSelectElement | null;
          const rbi = form.querySelector(
            `select[name="MemberScoreOf${inning}_daten[${index}]"]`,
          ) as HTMLSelectElement | null;
          const rbiSub = form.querySelector(
            `select[name="MemberScoreOf${inning}s_daten[${index}]"]`,
          ) as HTMLSelectElement | null;

          return {
            inning,
            mainValue: main?.value ?? null,
            mainLabel: main?.selectedOptions[0]?.textContent?.trim() ?? null,
            subValue: sub?.value ?? null,
            subLabel: sub?.selectedOptions[0]?.textContent?.trim() ?? null,
            rbiValue: rbi?.value ?? null,
            rbiSubValue: rbiSub?.value ?? null,
          };
        });

        const getInputValue = (name: string): string | null =>
          (form.querySelector(`input[name="${name}[${index}]"]`) as HTMLInputElement | null)?.value ?? null;

        playerRows.push({
          rowIndex: index,
          selectedUserId: userSelect.value,
          selectedUserLabel: userSelect.selectedOptions[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "",
          selectedPositionValue: positionSelect?.value ?? null,
          selectedPositionLabel: positionSelect?.selectedOptions[0]?.textContent?.trim() ?? null,
          rbi: getInputValue("MemberScoreOfDaten"),
          runs: getInputValue("MemberScoreOfTokuten"),
          steals: getInputValue("MemberScoreOfTorui"),
          caughtStealing: getInputValue("MemberScoreOfTouruisi"),
          errors: getInputValue("MemberScoreOfEr"),
          highlights: getInputValue("MemberScoreOfBigi"),
          inningEventValues,
        });
      }

      return {
        url: window.location.href,
        title: document.title,
        action: form.getAttribute("action"),
        method: form.getAttribute("method"),
        hiddenInputs,
        submitButtons,
        availableEventOptions: Array.from(
          (form.querySelector('select[name="MemberScoreOf1[1]"]') as HTMLSelectElement | null)?.options ?? [],
        ).map((option) => ({
          value: option.value,
          label: option.textContent?.trim() ?? "",
        })),
        playerRows,
      };
    });

    const summary = {
      sourcePreview,
      sourceTables: sourceSnapshot.tables.map((table) => ({
        tableIndex: table.tableIndex,
        caption: table.caption,
        headers: table.headers,
        firstRows: table.rows.slice(0, 5).map((row) => row.cells.map((cell) => cell.text)),
      })),
      gameListSummary,
      battingFormSummary,
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

void main();
