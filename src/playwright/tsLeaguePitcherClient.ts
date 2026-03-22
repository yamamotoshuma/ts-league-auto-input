import type {
  PitcherMappingPreview,
  PitcherStatField,
  PitcherTargetFormPreview,
  PitcherTargetRow,
  TargetControlRef,
  TargetSelectOption,
} from "../domain/types";
import type { Page } from "playwright";

const PITCHER_FIELD_NAMES: Record<PitcherStatField, string> = {
  innings: "MemberScoreDfIning",
  outs: "MemberScoreDfKaisu",
  earnedRuns: "MemberScoreDfJiseki",
  runsAllowed: "MemberScoreDfSiten",
  strikeouts: "MemberScoreDfDatusansin",
  walks: "MemberScoreDfSikyu",
  hitByPitch: "MemberScoreDfSisikyu",
  hitsAllowed: "MemberScoreDfHianda",
  homeRunsAllowed: "MemberScoreDfHiHr",
  wildPitches: "MemberScoreDfBoutou",
  balks: "MemberScoreDfBok",
  decision: "MemberScoreDfsyouhai",
  completeGameType: "MemberScoreDfKantou",
};

function escapeAttributeValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function isEmptySelectionValue(value: string): boolean {
  return value === "" || value === "0";
}

function stringifyStatValue(value: number | null): string {
  if (value === null) {
    return "";
  }

  return String(value);
}

async function getControlLocator(page: Page, ref: TargetControlRef) {
  const form = page.locator("form").nth(ref.formIndex);
  if (ref.name) {
    return form.locator(`[name="${escapeAttributeValue(ref.name)}"]`).first();
  }

  throw new Error("control locator could not be resolved");
}

function createKnownTargetPreview(pageUrl: string, pageTitle: string, payload: {
  action: string | null;
  method: string | null;
  hiddenInputs: Array<{ name: string | null; value: string | null }>;
  pitcherRows: PitcherTargetRow[];
}): PitcherTargetFormPreview {
  return {
    pageUrl,
    pageTitle,
    selectedFormIndex: 0,
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
    hiddenInputs: payload.hiddenInputs,
    pitcherRows: payload.pitcherRows,
  };
}

export async function inspectPitcherTargetForm(page: Page): Promise<PitcherTargetFormPreview> {
  const pageUrl = page.url();
  const pageTitle = await page.title();

  if (!pageUrl.includes("gamedf_edit.php")) {
    return {
      pageUrl,
      pageTitle,
      selectedFormIndex: null,
      action: null,
      method: null,
      availableForms: [],
      hiddenInputs: [],
      pitcherRows: [],
    };
  }

  const payload = await page.evaluate((fieldNames) => {
    const form = document.querySelector('form[action="gamedf_edit_complete.php"]') as HTMLFormElement | null;
    if (!form) {
      return {
        action: null,
        method: null,
        hiddenInputs: [],
        pitcherRows: [],
      };
    }

    const hiddenInputs = Array.from(form.querySelectorAll('input[type="hidden"]')).map((element) => ({
      name: element.getAttribute("name"),
      value: element.getAttribute("value"),
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

    const pitcherRows: PitcherTargetRow[] = [];
    for (let pitcherIndex = 1; pitcherIndex <= bcount; pitcherIndex += 1) {
      const userSelect = form.querySelector(
        `select[name="MemberScoreDfUserId[${pitcherIndex}]"]`,
      ) as HTMLSelectElement | null;
      if (!userSelect) {
        continue;
      }

      const pitcherLabel = userSelect.selectedOptions[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const statFields = Object.fromEntries(
        Object.entries(fieldNames).map(([field, baseName]) => {
          const name = `${baseName}[${pitcherIndex}]`;
          const control = form.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null;
          return [
            field,
            control
              ? {
                  formIndex: 0,
                  tableIndex: -1,
                  rowIndex: pitcherIndex,
                  cellIndex: -1,
                  controlIndex: -1,
                  headerText: field,
                  tagName: control.tagName.toLowerCase(),
                  type: "type" in control ? control.type ?? null : null,
                  name,
                  id: control.getAttribute("id"),
                  currentValue: "value" in control ? control.value ?? null : null,
                  currentLabel:
                    control instanceof HTMLSelectElement ? control.selectedOptions[0]?.textContent?.trim() ?? null : null,
                }
              : null,
          ];
        }),
      ) as PitcherTargetRow["statFields"];

      pitcherRows.push({
        formIndex: 0,
        rowIndex: pitcherIndex,
        pitcherIndex,
        pitcherLabel,
        normalizedPitcherLabel: pitcherLabel.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, "").toLowerCase(),
        selectedUserId: userSelect.value,
        pitcherControl: {
          formIndex: 0,
          tableIndex: -1,
          rowIndex: pitcherIndex,
          cellIndex: -1,
          controlIndex: -1,
          headerText: "投手",
          tagName: "select",
          type: "select-one",
          name: `MemberScoreDfUserId[${pitcherIndex}]`,
          id: null,
          currentValue: userSelect.value,
          currentLabel: pitcherLabel,
        },
        pitcherOptions: toSelectOptions(userSelect),
        statFields,
      });
    }

    return {
      action: form.getAttribute("action"),
      method: form.getAttribute("method"),
      hiddenInputs,
      pitcherRows,
    };
  }, PITCHER_FIELD_NAMES);

  return createKnownTargetPreview(pageUrl, pageTitle, payload);
}

export async function ensurePitcherRowCount(page: Page, desiredCount: number): Promise<void> {
  while (true) {
    const currentCount = await page.locator('select[name^="MemberScoreDfUserId["]').count();
    if (currentCount >= desiredCount) {
      return;
    }

    const form = page.locator('form[action="gamedf_edit_complete.php"]').first();
    const addButton = form.locator(
      'input[type="submit"][value*="追加"], input[type="button"][value*="追加"], button:has-text("追加")',
    ).first();

    if ((await addButton.count()) === 0) {
      throw new Error(`投手入力行が不足しています (${currentCount} / ${desiredCount})`);
    }

    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      addButton.click(),
    ]);
    await page.waitForLoadState("networkidle").catch(() => undefined);
  }
}

export async function applyPitcherMapping(page: Page, mapping: PitcherMappingPreview): Promise<void> {
  for (const assignment of mapping.assignments) {
    if (!assignment.targetPitcherLabel) {
      throw new Error(`target row not found for ${assignment.allocation.pitcherName}`);
    }

    if (!assignment.playerSelection?.control || !assignment.playerSelection.targetOptionValue) {
      throw new Error(`target pitcher selection is incomplete for ${assignment.allocation.pitcherName}`);
    }

    {
      const locator = await getControlLocator(page, assignment.playerSelection.control);
      const existingValue = await locator.inputValue().catch(() => "");
      if (!isEmptySelectionValue(existingValue) && existingValue !== assignment.playerSelection.targetOptionValue) {
        throw new Error(`existing target pitcher would be overwritten for ${assignment.allocation.pitcherName}`);
      }

      if (existingValue !== assignment.playerSelection.targetOptionValue) {
        await locator.selectOption(assignment.playerSelection.targetOptionValue);
      }
    }

    for (const field of [
      "innings",
      "outs",
      "runsAllowed",
      "strikeouts",
      "walks",
      "hitByPitch",
      "hitsAllowed",
      "homeRunsAllowed",
    ] as const) {
      const control = assignment.statAssignments[field];
      const sourceValue = assignment.derivedStats[field];
      if (!control || sourceValue === null) {
        continue;
      }

      const locator = await getControlLocator(page, control);
      const existingValue = await locator.inputValue().catch(() => "");
      const intendedValue = stringifyStatValue(sourceValue);

      if (existingValue !== "" && existingValue !== intendedValue) {
        throw new Error(`existing target value would be overwritten for ${assignment.allocation.pitcherName} / ${field}`);
      }

      if (existingValue === intendedValue) {
        continue;
      }

      await locator.fill(intendedValue);
    }
  }
}

export async function submitPitcherTargetForm(page: Page, preview: PitcherTargetFormPreview): Promise<void> {
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
