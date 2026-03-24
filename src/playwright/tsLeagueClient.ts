import type {
  BatterStat,
  GameMatchCandidate,
  MappingPreview,
  TargetAppearanceField,
  TargetControlRef,
  TargetEventOption,
  TargetFormPreview,
  TargetPlayerRow,
  TargetSelectOption,
  TsLeagueSecrets,
} from "../domain/types";
import type { Page } from "playwright";
import { TS_LEAGUE_LOGIN_SELECTORS } from "../utils/constants";
import { normalizeLooseKey, normalizeName, normalizeText } from "../utils/nameNormalizer";

function escapeAttributeValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function buildControlRef(
  formIndex: number,
  rowIndex: number,
  headerText: string,
  name: string,
  currentValue: string | null,
  currentLabel?: string | null,
): TargetControlRef {
  return {
    formIndex,
    tableIndex: -1,
    rowIndex,
    cellIndex: -1,
    controlIndex: -1,
    headerText,
    tagName: "input",
    type: null,
    name,
    id: null,
    currentValue,
    currentLabel: currentLabel ?? null,
  };
}

async function ensureTsLeagueLogin(page: Page, secrets: TsLeagueSecrets): Promise<void> {
  await page.goto(secrets.loginUrl, { waitUntil: "domcontentloaded" });
  const loginSelector = TS_LEAGUE_LOGIN_SELECTORS.join(", ");
  const needsLogin = (await page.locator(loginSelector).count()) > 0;
  if (!needsLogin) {
    return;
  }

  const form = page.locator(loginSelector).first();
  await form.locator('input[name="userid"]').fill(secrets.username);
  await form.locator('input[name="password"]').fill(secrets.password);
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    form.locator('input[type="submit"], button[type="submit"]').first().click(),
  ]);

  if ((await page.locator(loginSelector).count()) > 0) {
    throw new Error("TS-League login failed");
  }
}

function scoreGameCandidate(
  label: string,
  targetGameKey: string,
  targetGameDate: string | null,
  targetOpponent: string | null,
  targetVenue: string | null,
): number {
  const haystack = normalizeLooseKey(label);
  const tokens = [targetGameKey, targetGameDate, targetOpponent, targetVenue]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => normalizeLooseKey(value).split(/\s+/))
    .filter(Boolean);

  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 10;
    }
  }

  if (haystack.includes(normalizeLooseKey(targetGameKey))) {
    score += 20;
  }

  return score;
}

export async function openTargetGame(
  page: Page,
  secrets: TsLeagueSecrets,
  params: {
    targetGameKey: string;
    targetGameDate: string | null;
    targetOpponent: string | null;
    targetVenue: string | null;
    editAction?: "gameof_edit.php" | "gamedf_edit.php";
  },
): Promise<{ candidates: GameMatchCandidate[]; selectedUrl: string | null }> {
  await ensureTsLeagueLogin(page, secrets);
  await page.goto(secrets.gameListUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);

  const rawCandidates = await page.evaluate((action) => {
    return Array.from(document.forms)
      .map((form, formIndex) => {
        const htmlForm = form as HTMLFormElement;
        const formAction = htmlForm.getAttribute("action") ?? "";
        const row = htmlForm.closest("tr");
        const rowText = row ? (row.textContent ?? "").replace(/\s+/g, " ").trim() : "";
        return {
          formIndex,
          action: formAction,
          label: rowText,
          href: null,
          score: 0,
        };
      })
      .filter((item) => item.action === action && item.label !== "");
  }, params.editAction ?? "gameof_edit.php");
  const candidates = rawCandidates
    .map((candidate) => ({
      ...candidate,
      score: scoreGameCandidate(
        candidate.label,
        params.targetGameKey,
        params.targetGameDate,
        params.targetOpponent,
        params.targetVenue,
      ),
    }))
    .sort((left, right) => right.score - left.score);

  const best = candidates[0] ?? null;
  if (!best || best.score <= 0) {
    throw new Error("target game candidate was not found");
  }

  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page.locator("form").nth(best.formIndex).locator('input[type="submit"]').click(),
  ]);
  await page.waitForLoadState("networkidle").catch(() => undefined);

  return {
    candidates: candidates.map(({ label, href, score }) => ({ label, href, score })),
    selectedUrl: page.url(),
  };
}

function createKnownTargetPreview(pageUrl: string, pageTitle: string, payload: {
  action: string | null;
  method: string | null;
  hiddenInputs: Array<{ name: string | null; value: string | null }>;
  eventOptions: TargetEventOption[];
  playerRows: TargetPlayerRow[];
}): TargetFormPreview {
  return {
    pageUrl,
    pageTitle,
    selectedFormIndex: 0,
    selectedTableIndex: null,
    action: payload.action,
    method: payload.method,
    availableForms: [
      {
        formIndex: 0,
        action: payload.action,
        method: payload.method,
        tableCount: 0,
        looseControlCount: 0,
      },
    ],
    headers: ["row", "player", "position", "rbi", "runs", "steals", "errors", "appearanceResults"],
    hiddenInputs: payload.hiddenInputs,
    eventOptions: payload.eventOptions,
    playerRows: payload.playerRows,
  };
}

export async function inspectTargetForm(page: Page): Promise<TargetFormPreview> {
  const pageUrl = page.url();
  const pageTitle = await page.title();

  if (pageUrl.includes("gameof_edit.php")) {
    const payload = await page.evaluate(() => {
      const form = document.querySelector('form[action="gameof_edit_complete.php"]') as HTMLFormElement | null;
      if (!form) {
        return {
          action: null,
          method: null,
          hiddenInputs: [],
          eventOptions: [],
          playerRows: [],
        };
      }

      const hiddenInputs = Array.from(form.querySelectorAll('input[type="hidden"]')).map((element) => ({
        name: element.getAttribute("name"),
        value: element.getAttribute("value"),
      }));

      const eventOptions = Array.from(
        (form.querySelector('select[name="MemberScoreOf1[1]"]') as HTMLSelectElement | null)?.options ?? [],
      ).map((option) => ({
        value: option.value,
        label: option.textContent?.trim() ?? "",
      }));

      const toSelectOptions = (select: HTMLSelectElement | null): TargetSelectOption[] =>
        Array.from(select?.options ?? []).map((option) => ({
          value: option.value,
          label: option.textContent?.replace(/\s+/g, " ").trim() ?? "",
          normalizedLabel: (option.textContent ?? "")
            .normalize("NFKC")
            .replace(/\[[^\]]+\]/g, "")
            .replace(/[　\s]+/g, "")
            .trim()
            .toLowerCase(),
        }));

      const bcount = Number.parseInt(
        (form.querySelector('input[name="bcount"]') as HTMLInputElement | null)?.value ?? "0",
        10,
      );

      const playerRows: TargetPlayerRow[] = [];
      for (let lineupIndex = 1; lineupIndex <= bcount; lineupIndex += 1) {
        const userSelect = form.querySelector(
          `select[name="MemberScoreOfUserId[${lineupIndex}]"]`,
        ) as HTMLSelectElement | null;
        if (!userSelect) {
          continue;
        }

        const userLabel = userSelect.selectedOptions[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const positionSelect = form.querySelector(
          `select[name="MemberScoreOfSyubi[${lineupIndex}]"]`,
        ) as HTMLSelectElement | null;
        const positionLabel = positionSelect?.selectedOptions[0]?.textContent?.trim() ?? null;
        const playerOptions = toSelectOptions(userSelect);
        const positionOptions = toSelectOptions(positionSelect);

        const statFields: TargetPlayerRow["statFields"] = {
          rbi: {
            formIndex: 0,
            tableIndex: -1,
            rowIndex: lineupIndex,
            cellIndex: -1,
            controlIndex: -1,
            headerText: "打点",
            tagName: "input",
            type: "text",
            name: `MemberScoreOfDaten[${lineupIndex}]`,
            id: null,
            currentValue: (form.querySelector(`input[name="MemberScoreOfDaten[${lineupIndex}]"]`) as HTMLInputElement | null)
              ?.value ?? null,
          },
          runs: {
            formIndex: 0,
            tableIndex: -1,
            rowIndex: lineupIndex,
            cellIndex: -1,
            controlIndex: -1,
            headerText: "得点",
            tagName: "input",
            type: "text",
            name: `MemberScoreOfTokuten[${lineupIndex}]`,
            id: null,
            currentValue: (form.querySelector(`input[name="MemberScoreOfTokuten[${lineupIndex}]"]`) as HTMLInputElement | null)
              ?.value ?? null,
          },
          stolenBases: {
            formIndex: 0,
            tableIndex: -1,
            rowIndex: lineupIndex,
            cellIndex: -1,
            controlIndex: -1,
            headerText: "盗塁",
            tagName: "input",
            type: "text",
            name: `MemberScoreOfTorui[${lineupIndex}]`,
            id: null,
            currentValue: (form.querySelector(`input[name="MemberScoreOfTorui[${lineupIndex}]"]`) as HTMLInputElement | null)
              ?.value ?? null,
          },
          errors: {
            formIndex: 0,
            tableIndex: -1,
            rowIndex: lineupIndex,
            cellIndex: -1,
            controlIndex: -1,
            headerText: "失策",
            tagName: "input",
            type: "text",
            name: `MemberScoreOfEr[${lineupIndex}]`,
            id: null,
            currentValue: (form.querySelector(`input[name="MemberScoreOfEr[${lineupIndex}]"]`) as HTMLInputElement | null)
              ?.value ?? null,
          },
        };

        const appearanceFields: TargetAppearanceField[] = Array.from({ length: 9 }, (_, index) => {
          const appearanceIndex = index + 1;
          const mainSelect = form.querySelector(
            `select[name="MemberScoreOf${appearanceIndex}[${lineupIndex}]"]`,
          ) as HTMLSelectElement | null;
          const subSelect = form.querySelector(
            `select[name="MemberScoreOf${appearanceIndex}s[${lineupIndex}]"]`,
          ) as HTMLSelectElement | null;
          const rbiSelect = form.querySelector(
            `select[name="MemberScoreOf${appearanceIndex}_daten[${lineupIndex}]"]`,
          ) as HTMLSelectElement | null;
          const rbiSubSelect = form.querySelector(
            `select[name="MemberScoreOf${appearanceIndex}s_daten[${lineupIndex}]"]`,
          ) as HTMLSelectElement | null;

          return {
            appearanceIndex,
            main: mainSelect
              ? {
                  formIndex: 0,
                  tableIndex: -1,
                  rowIndex: lineupIndex,
                  cellIndex: -1,
                  controlIndex: -1,
                  headerText: String(appearanceIndex),
                  tagName: "select",
                  type: "select-one",
                  name: `MemberScoreOf${appearanceIndex}[${lineupIndex}]`,
                  id: null,
                  currentValue: mainSelect.value,
                  currentLabel: mainSelect.selectedOptions[0]?.textContent?.trim() ?? null,
                }
              : null,
            sub: subSelect
              ? {
                  formIndex: 0,
                  tableIndex: -1,
                  rowIndex: lineupIndex,
                  cellIndex: -1,
                  controlIndex: -1,
                  headerText: `${appearanceIndex}s`,
                  tagName: "select",
                  type: "select-one",
                  name: `MemberScoreOf${appearanceIndex}s[${lineupIndex}]`,
                  id: null,
                  currentValue: subSelect.value,
                  currentLabel: subSelect.selectedOptions[0]?.textContent?.trim() ?? null,
                }
              : null,
            rbi: rbiSelect
              ? {
                  formIndex: 0,
                  tableIndex: -1,
                  rowIndex: lineupIndex,
                  cellIndex: -1,
                  controlIndex: -1,
                  headerText: `${appearanceIndex}_daten`,
                  tagName: "select",
                  type: "select-one",
                  name: `MemberScoreOf${appearanceIndex}_daten[${lineupIndex}]`,
                  id: null,
                  currentValue: rbiSelect.value,
                  currentLabel: rbiSelect.selectedOptions[0]?.textContent?.trim() ?? null,
                }
              : null,
            rbiSub: rbiSubSelect
              ? {
                  formIndex: 0,
                  tableIndex: -1,
                  rowIndex: lineupIndex,
                  cellIndex: -1,
                  controlIndex: -1,
                  headerText: `${appearanceIndex}s_daten`,
                  tagName: "select",
                  type: "select-one",
                  name: `MemberScoreOf${appearanceIndex}s_daten[${lineupIndex}]`,
                  id: null,
                  currentValue: rbiSubSelect.value,
                  currentLabel: rbiSubSelect.selectedOptions[0]?.textContent?.trim() ?? null,
                }
              : null,
          };
        });

        playerRows.push({
          formIndex: 0,
          tableIndex: -1,
          rowIndex: lineupIndex,
          lineupIndex,
          playerLabel: userLabel,
          normalizedPlayerLabel: userLabel.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, "").toLowerCase(),
          selectedUserId: userSelect.value,
          playerControl: {
            formIndex: 0,
            tableIndex: -1,
            rowIndex: lineupIndex,
            cellIndex: -1,
            controlIndex: -1,
            headerText: "選手",
            tagName: "select",
            type: "select-one",
            name: `MemberScoreOfUserId[${lineupIndex}]`,
            id: null,
            currentValue: userSelect.value,
            currentLabel: userLabel,
          },
          playerOptions,
          selectedPositionLabel: positionLabel,
          positionControl: positionSelect
            ? {
                formIndex: 0,
                tableIndex: -1,
                rowIndex: lineupIndex,
                cellIndex: -1,
                controlIndex: -1,
                headerText: "守備位置",
                tagName: "select",
                type: "select-one",
                name: `MemberScoreOfSyubi[${lineupIndex}]`,
                id: null,
                currentValue: positionSelect.value,
                currentLabel: positionLabel,
              }
            : null,
          positionOptions,
          statFields,
          appearanceFields,
          extraControls: [],
        });
      }

      return {
        action: form.getAttribute("action"),
        method: form.getAttribute("method"),
        hiddenInputs,
        eventOptions,
        playerRows,
      };
    });

    return createKnownTargetPreview(pageUrl, pageTitle, payload);
  }

  return {
    pageUrl,
    pageTitle,
    selectedFormIndex: null,
    selectedTableIndex: null,
    action: null,
    method: null,
    availableForms: [],
    headers: [],
    hiddenInputs: [],
    eventOptions: [],
    playerRows: [],
  };
}

async function getControlLocator(page: Page, ref: TargetControlRef) {
  const form = page.locator("form").nth(ref.formIndex);
  if (ref.name) {
    return form.locator(`[name="${escapeAttributeValue(ref.name)}"]`).first();
  }

  if (ref.tableIndex >= 0) {
    const table = form.locator("table").nth(ref.tableIndex);
    const row = table.locator("tr").nth(ref.rowIndex);
    return row.locator("input, select, textarea").nth(ref.controlIndex);
  }

  throw new Error("control locator could not be resolved");
}

function stringifyStatValue(value: BatterStat[keyof BatterStat]): string {
  if (value === null) {
    return "";
  }

  return String(value);
}

function isEmptySelectionValue(value: string): boolean {
  return value === "" || value === "0";
}

export async function applyMapping(page: Page, mapping: MappingPreview): Promise<void> {
  for (const assignment of mapping.assignments) {
    if (!assignment.targetPlayerLabel) {
      throw new Error(`target row not found for ${assignment.source.playerName}`);
    }

    if (!assignment.playerSelection?.control || !assignment.playerSelection.targetOptionValue) {
      throw new Error(`target player selection is incomplete for ${assignment.source.playerName}`);
    }

    {
      const locator = await getControlLocator(page, assignment.playerSelection.control);
      const existingValue = await locator.inputValue().catch(() => "");
      if (existingValue !== assignment.playerSelection.targetOptionValue) {
        await locator.selectOption(assignment.playerSelection.targetOptionValue);
      }
    }

    if (assignment.positionSelection?.control && assignment.positionSelection.targetOptionValue !== null) {
      const locator = await getControlLocator(page, assignment.positionSelection.control);
      const existingValue = await locator.inputValue().catch(() => "");
      if (existingValue !== assignment.positionSelection.targetOptionValue) {
        await locator.selectOption(assignment.positionSelection.targetOptionValue);
      }
    }

    for (const [field, control] of Object.entries(assignment.statAssignments)) {
      if (!control) {
        continue;
      }

      const sourceValue = assignment.source[field as keyof BatterStat];
      if (sourceValue === null) {
        continue;
      }

      const locator = await getControlLocator(page, control);
      const existingValue = await locator.inputValue().catch(() => "");
      const intendedValue = stringifyStatValue(sourceValue);

      if (existingValue === intendedValue) {
        continue;
      }

      await locator.fill(intendedValue);
    }

    for (const appearance of assignment.appearanceAssignments) {
      if (!appearance.targetControl || !appearance.targetOptionValue) {
        throw new Error(
          `target appearance mapping is incomplete for ${assignment.source.playerName} / ${appearance.sourceText}`,
        );
      }

      const locator = await getControlLocator(page, appearance.targetControl);
      const existingValue = await locator.inputValue().catch(() => "");
      if (existingValue === appearance.targetOptionValue) {
        continue;
      }

      await locator.selectOption(appearance.targetOptionValue);

      if (appearance.rbiControl && assignment.source.rbi !== null) {
        const rbiLocator = await getControlLocator(page, appearance.rbiControl);
        const existingRbiValue = await rbiLocator.inputValue().catch(() => "");
        if (existingRbiValue !== "0" && existingRbiValue !== "" && existingRbiValue !== "0") {
          continue;
        }
      }
    }
  }
}

export async function submitTargetForm(page: Page, preview: TargetFormPreview): Promise<void> {
  if (preview.selectedFormIndex === null) {
    throw new Error("target form was not selected");
  }

  const form = page.locator("form").nth(preview.selectedFormIndex);
  const primarySubmit = form.locator("#sbmitBtn").first();
  const submit =
    (await primarySubmit.count()) > 0
      ? primarySubmit
      : form.locator('button[type="submit"], input[type="submit"]').last();
  if ((await submit.count()) === 0) {
    throw new Error("target submit button was not found");
  }

  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    submit.click(),
  ]);
}

export async function verifySubmitResult(page: Page): Promise<boolean> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (page.url().includes("/complete.php") && /無事に登録が完了しました/.test(bodyText)) {
    return true;
  }

  if (page.url().includes("complete.php") && /(登録|完了)/.test(bodyText)) {
    return true;
  }

  return page.url().includes("complete");
}
