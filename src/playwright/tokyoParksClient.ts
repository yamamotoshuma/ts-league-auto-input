import type { Page } from "playwright";
import { buildApplyHopeValue, getParkSportLabel, isParkLotterySubmissionComplete } from "../domain/parkLottery";
import type {
  ParkLotteryAccountPreview,
  ParkLotteryApplyOption,
  ParkLotteryEntryInput,
  ParkLotteryEntryPreview,
  TokyoParkAccountSecrets,
  TokyoParksSecrets,
} from "../domain/types";

const PARK_HOME_URL = "https://kouen.sports.metro.tokyo.lg.jp/web/index.jsp";
const PARK_LOGIN_URL = "https://kouen.sports.metro.tokyo.lg.jp/web/rsvWTransUserLoginAction.do";
const PARK_LOTTERY_LIST_URL = "https://kouen.sports.metro.tokyo.lg.jp/web/lotWOpeLotSearchAction.do";
const PARK_OPTION_WAIT_MS = 30_000;
const PARK_SETTLE_MS = 2_500;
const PARK_LONG_SETTLE_MS = 4_000;
const PARK_RETRY_COUNT = 3;

function normalizeOptionLabel(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

async function gotoParkHome(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl || PARK_HOME_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

async function gotoParkLogin(page: Page): Promise<void> {
  await page.goto(PARK_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

async function waitForLoginForm(page: Page): Promise<void> {
  await page.waitForSelector("#userId", { timeout: 30_000 });
  await page.waitForSelector("#password", { timeout: 30_000 });
}

async function waitForAuthenticatedPage(page: Page): Promise<boolean> {
  const loggedIn = await page
    .waitForFunction(
      () => {
        const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ");
        return !document.querySelector("#userId") && /利用者カード表示|マイメニュー|抽選申込み|空き状況検索/.test(bodyText);
      },
      undefined,
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);

  return loggedIn && !/rsvWTransUserLoginAction\.do/.test(page.url());
}

async function moveToLoginPage(page: Page): Promise<void> {
  const loginButton = page
    .locator('#btn-login, a[href*="rsvWTransUserLoginAction"], button:has-text("ログイン"), input[type="button"][value*="ログイン"]')
    .first();

  if ((await loginButton.count()) > 0) {
    await Promise.all([
      page.waitForURL(/rsvWTransUserLoginAction\.do/, { timeout: 15_000 }),
      loginButton.click(),
    ]);
    return;
  }

  const navigated = await page
    .evaluate(() => {
      const win = window as typeof window & {
        doAction?: (form: HTMLFormElement, action: string) => void;
        gRsvWTransUserLoginAction?: string;
      };

      if (typeof win.doAction !== "function" || typeof win.gRsvWTransUserLoginAction !== "string") {
        return false;
      }

      win.doAction(document.forms.namedItem("form1") as HTMLFormElement, win.gRsvWTransUserLoginAction);
      return true;
    })
    .catch(() => false);

  if (!navigated) {
    throw new Error("ログイン画面への導線が見つかりません");
  }

  await page.waitForURL(/rsvWTransUserLoginAction\.do/, { timeout: 15_000 });
}

async function selectOptionByLabel(page: Page, selector: string, expectedLabel: string, fieldLabel: string): Promise<string> {
  await page.waitForFunction(
    ({ selectSelector, label }) => {
      const normalize = (value: string) =>
        value
          .normalize("NFKC")
          .replace(/\s+/g, "")
          .toLowerCase();

      const select = document.querySelector<HTMLSelectElement>(selectSelector);
      if (!select) {
        return false;
      }

      const normalizedLabel = normalize(label);
      return Array.from(select.options).some((option) => {
        if (!option.value) {
          return false;
        }

        const normalizedOption = normalize(option.textContent || "");
        return normalizedOption === normalizedLabel || normalizedOption.includes(normalizedLabel);
      });
    },
    { selectSelector: selector, label: expectedLabel },
    { timeout: PARK_OPTION_WAIT_MS },
  );

  const options = await page.locator(`${selector} option`).evaluateAll((nodes) =>
    nodes.map((node) => ({
      value: (node as HTMLOptionElement).value,
      label: (node.textContent || "").trim(),
    })),
  );

  const normalizedExpected = normalizeOptionLabel(expectedLabel);
  const exact = options.find((option) => option.value && normalizeOptionLabel(option.label) === normalizedExpected);
  const partial =
    exact ??
    options.find((option) => option.value && normalizeOptionLabel(option.label).includes(normalizedExpected));

  if (!partial) {
    throw new Error(`${fieldLabel} "${expectedLabel}" に一致する候補が見つかりません`);
  }

  await page.selectOption(selector, partial.value);
  return partial.label;
}

async function openParkLotteryList(page: Page): Promise<void> {
  for (let attempt = 0; attempt < PARK_RETRY_COUNT; attempt += 1) {
    if (/lotWOpeLotSearchAction\.do/.test(page.url())) {
      await page.waitForTimeout(PARK_SETTLE_MS);
      return;
    }

    const movedByAction = await page
      .evaluate(() => {
        const win = window as typeof window & {
          doAction?: (form: HTMLFormElement, action: string) => void;
          gLotWOpeLotSearchAction?: string;
        };
        const form = document.forms.namedItem("form1") as HTMLFormElement | null;

        if (!form || typeof win.doAction !== "function" || typeof win.gLotWOpeLotSearchAction !== "string") {
          return false;
        }

        win.doAction(form, win.gLotWOpeLotSearchAction);
        return true;
      })
      .catch(() => false);

    if (!movedByAction) {
      await page.goto(PARK_LOTTERY_LIST_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }

    const reached = await page
      .waitForURL(/lotWOpeLotSearchAction\.do/, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (reached) {
      await page.waitForTimeout(PARK_SETTLE_MS);
      return;
    }

    await page.waitForTimeout(PARK_SETTLE_MS * (attempt + 1));
  }

  throw new Error("抽選分類一覧へ遷移できませんでした");
}

async function selectLotteryCategory(page: Page, classCode: string, selectedSportLabel: string | null): Promise<string | null> {
  const selectedCategory = await page.evaluate(({ requestedClassCode, sportLabel }) => {
    const normalize = (value: string | null | undefined) =>
      String(value ?? "")
        .normalize("NFKC")
        .replace(/\s+/g, "")
        .toLowerCase();

    const normalizeCode = (value: string | null | undefined) => String(value ?? "").trim();
    const normalizedClassCode = normalizeCode(requestedClassCode);
    const normalizedSportLabel = normalize(sportLabel);

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('button[onclick*="doLotEntry"], a[href*="doLotEntry"], [onclick*="doLotEntry"]'),
    )
      .map((node) => {
        const text = (node.textContent || "").trim();
        const onclick = node.getAttribute("onclick") || node.getAttribute("href") || "";
        const codeMatch = onclick.match(/doLotEntry\(["']?(\d+)["']?\)/);
        const code = normalizeCode(codeMatch?.[1] ?? "");
        const label = normalize(text);
        const score =
          code === normalizedClassCode ? 3 : normalizedSportLabel !== "" && label.includes(normalizedSportLabel) ? 1 : 0;
        return {
          node,
          text,
          code,
          score,
        };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score);

    const matched = candidates[0];
    if (matched) {
      matched.node.click();
      return matched.text || sportLabel || requestedClassCode;
    }

    const win = window as typeof window & {
      doLotEntry?: (value: string) => void;
    };

    if (typeof win.doLotEntry === "function") {
      win.doLotEntry(requestedClassCode);
      return sportLabel || requestedClassCode;
    }

    return null;
  }, { requestedClassCode: classCode, sportLabel: selectedSportLabel });

  if (!selectedCategory) {
    throw new Error(`競技 "${selectedSportLabel ?? classCode}" の申込み導線が見つかりません`);
  }

  await page.waitForURL(/lotWOpeTransLotInstSrchVacantAction\.do/, { timeout: 30_000 });
  return selectedCategory;
}

async function waitForTimeGrid(page: Page): Promise<void> {
  for (let attempt = 0; attempt < PARK_RETRY_COUNT; attempt += 1) {
    const loaded = await page
      .waitForFunction(
        () => document.querySelectorAll('#usedate-table thead input[name="selectUseYMD"]').length > 0,
        undefined,
        { timeout: 12_000 },
      )
      .then(() => true)
      .catch(() => false);

    if (loaded) {
      await page.waitForTimeout(PARK_SETTLE_MS);
      return;
    }

    await page.waitForTimeout(PARK_LONG_SETTLE_MS);
  }

  throw new Error("空き状況テーブルの読込が完了しませんでした");
}

function formatJpTime(value: string): string {
  return `${value.slice(0, 2)}時${value.slice(2)}分`;
}

async function ensureDateVisible(page: Page, useDate: string): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const headerValues = await page.locator('#usedate-table thead input[name="selectUseYMD"]').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLInputElement).value),
    );

    if (headerValues.includes(useDate)) {
      return;
    }

    const min = headerValues[0];
    const max = headerValues[headerValues.length - 1];
    if (!min || !max) {
      throw new Error("利用日の候補が表示されていません");
    }

    if (useDate > max) {
      const nextWeek = page.locator("#next-week");
      if ((await nextWeek.count()) === 0 || (await nextWeek.isDisabled())) {
        break;
      }
      await nextWeek.click();
      await page.waitForTimeout(PARK_SETTLE_MS);
      continue;
    }

    if (useDate < min) {
      const prevWeek = page.locator("#last-week");
      if ((await prevWeek.count()) === 0 || (await prevWeek.isDisabled())) {
        break;
      }
      await prevWeek.click();
      await page.waitForTimeout(PARK_SETTLE_MS);
      continue;
    }

    break;
  }

  throw new Error(`利用日 ${useDate} が表示範囲に見つかりません`);
}

async function selectTimeRange(page: Page, entry: ParkLotteryEntryInput): Promise<{ displayDate: string; displayTime: string }> {
  const result = await page.evaluate(({ useDate, startTime, endTime }) => {
    const normalizeTime = (value: string | null) => {
      if (!value) {
        return null;
      }

      const digits = value.replace(/[^0-9]/g, "");
      if (!digits || digits.length > 4) {
        return null;
      }

      return digits.padStart(4, "0");
    };

    const normalizedStartTime = normalizeTime(startTime);
    const normalizedEndTime = normalizeTime(endTime);
    if (!normalizedStartTime || !normalizedEndTime) {
      return {
        ok: false,
        message: "開始時刻または終了時刻の形式が不正です",
      };
    }

    const headerCells = Array.from(document.querySelectorAll<HTMLTableCellElement>("#usedate-table thead tr th"));
    const candidateCells = Array.from(document.querySelectorAll<HTMLTableCellElement>("#usedate-table tbody td")).flatMap((htmlCell) => {
      if (htmlCell.classList.contains("calendar-status")) {
        return [];
      }

      const header = headerCells[htmlCell.cellIndex];
      const useYmd = header?.querySelector('input[name="selectUseYMD"]')?.getAttribute("value");
      if (useYmd !== useDate) {
        return [];
      }

      const start = normalizeTime(htmlCell.querySelector('input[name="selectStime"]')?.getAttribute("value") ?? null);
      const end = normalizeTime(htmlCell.querySelector('input[name="selectEtime"]')?.getAttribute("value") ?? null);
      if (!start || !end) {
        return [];
      }

      return [
        {
          cell: htmlCell,
          start,
          end,
        },
      ];
    });

    candidateCells.sort((left, right) => left.start.localeCompare(right.start));

    const chain: Array<{ cell: HTMLTableCellElement; start: string; end: string }> = [];
    let current = normalizedStartTime;
    while (current < normalizedEndTime) {
      const match = candidateCells.find((candidate) => candidate.start === current);
      if (!match) {
        return {
          ok: false,
          message: `時間帯 ${normalizedStartTime}-${normalizedEndTime} の連続コマを見つけられませんでした`,
        };
      }

      chain.push(match);
      current = match.end;
    }

    if (current !== normalizedEndTime) {
      return {
        ok: false,
        message: `時間帯 ${normalizedStartTime}-${normalizedEndTime} の終端が一致しませんでした`,
      };
    }

    chain.forEach((candidate) => {
      candidate.cell.click();
    });

    return {
      ok: true,
      displayDate: (document.querySelector("#selectDisplayUseYMD")?.textContent || "").replace(/\s+/g, " ").trim(),
      displayTime: (document.querySelector("#selectDisplayTime")?.textContent || "").replace(/\s+/g, " ").trim(),
    };
  }, entry);

  if (!result.ok) {
    throw new Error(result.message);
  }

  await page
    .waitForFunction(
      () => {
        const dateText = (document.querySelector("#selectDisplayUseYMD")?.textContent || "").trim();
        const timeText = (document.querySelector("#selectDisplayTime")?.textContent || "").trim();
        return dateText !== "" && timeText !== "";
      },
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => undefined);

  const displayDate = typeof result.displayDate === "string" ? result.displayDate : "";
  const displayTime = typeof result.displayTime === "string" ? result.displayTime : "";

  return {
    displayDate,
    displayTime,
  };
}

async function inspectApplyOptions(page: Page): Promise<ParkLotteryApplyOption[]> {
  return page.locator("#apply option").evaluateAll((nodes) =>
    nodes.map((node) => ({
      value: (node as HTMLOptionElement).value,
      label: (node.textContent || "").trim(),
    })),
  );
}

function findRequestedApplyOption(
  entry: ParkLotteryEntryInput,
  applyOptions: ParkLotteryApplyOption[],
): ParkLotteryApplyOption | null {
  const requestedValue = buildApplyHopeValue(entry.applyNumber);
  if (!requestedValue) {
    return null;
  }

  return applyOptions.find((option) => option.value === requestedValue) ?? null;
}

export async function loginTokyoParks(
  page: Page,
  secrets: TokyoParksSecrets,
  account: TokyoParkAccountSecrets,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await gotoParkHome(page, secrets.baseUrl);
    const hasLoginForm = await page
      .locator("#userId")
      .first()
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (hasLoginForm) {
      break;
    }

    try {
      await moveToLoginPage(page);
    } catch {
      await gotoParkLogin(page).catch(() => undefined);
    }

    const loginReady = await page
      .locator("#userId")
      .first()
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (loginReady) {
      break;
    }

    await page.waitForTimeout(1_000 * (attempt + 1));
  }

  for (let attempt = 0; attempt < PARK_RETRY_COUNT; attempt += 1) {
    await waitForLoginForm(page);
    await page.fill("#userId", account.userId);
    await page.fill("#password", account.password);
    await Promise.all([
      page.waitForURL(/rsvWUserAttestationLoginAction\.do/, { timeout: 30_000 }).catch(() => undefined),
      page.click("#btn-go"),
    ]);
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(PARK_SETTLE_MS);

    if (await waitForAuthenticatedPage(page)) {
      return;
    }

    await page.waitForTimeout(PARK_LONG_SETTLE_MS * (attempt + 1));
  }

  throw new Error(`都立公園へのログインに失敗しました: ${account.userId}`);
}

export async function logoutTokyoParks(page: Page, baseUrl: string): Promise<void> {
  try {
    await page.evaluate(() => {
      const win = window as typeof window & {
        doAction?: (form: HTMLFormElement, action: string) => void;
        gRsvWTransUserAttestationEndAction?: string;
      };

      if (typeof win.gRsvWTransUserAttestationEndAction === "string" && typeof win.doAction === "function") {
        win.doAction(document.forms.namedItem("form1") as HTMLFormElement, win.gRsvWTransUserAttestationEndAction);
      }
    });
    await page.waitForTimeout(PARK_SETTLE_MS);
  } catch {
    // Ignore logout failures and fall back to the home page.
  }

  await page.context().clearCookies().catch(() => undefined);
  await gotoParkHome(page, baseUrl);
}

export async function prepareTokyoParkLotteryEntry(page: Page, entry: ParkLotteryEntryInput): Promise<ParkLotteryEntryPreview> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < PARK_RETRY_COUNT; attempt += 1) {
    try {
      if ((await page.locator("#userId").count()) > 0 || /rsvWTransUserLoginAction\.do/.test(page.url())) {
        throw new Error("ログイン状態を維持できませんでした");
      }

      await openParkLotteryList(page);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(PARK_SETTLE_MS);
      const selectedSportLabel = entry.sportLabel ?? getParkSportLabel(entry.sportClassCode);
      const selectedCategory = await selectLotteryCategory(page, entry.sportClassCode, selectedSportLabel);
      await page.waitForTimeout(PARK_SETTLE_MS);

      const selectedParkName = await selectOptionByLabel(page, "#bname", entry.parkName, "公園");
      await page.waitForFunction(() => document.querySelectorAll("#iname option").length > 1, undefined, {
        timeout: PARK_OPTION_WAIT_MS,
      });
      await page.waitForTimeout(PARK_LONG_SETTLE_MS);
      const selectedFacilityName = await selectOptionByLabel(page, "#iname", entry.facilityName, "施設");
      await page.waitForTimeout(PARK_LONG_SETTLE_MS);
      await waitForTimeGrid(page);

      await ensureDateVisible(page, entry.useDate);
      const slotSelection = await selectTimeRange(page, entry);

      await Promise.all([
        page.waitForURL(/lotWInstTempLotApplyAction\.do/, { timeout: 30_000 }),
        page.click("#btn-go"),
      ]);
      await page.waitForTimeout(PARK_SETTLE_MS);

      const applyOptions = await inspectApplyOptions(page);
      const requestedApplyOption = findRequestedApplyOption(entry, applyOptions);
      const confirmedSportLabel =
        (await page.locator("table.sp-block-table tbody tr td").first().textContent())?.replace(/^[^：]+：/, "").trim() ?? null;

      const warnings: string[] = [];
      let status: ParkLotteryEntryPreview["status"] = "ready";
      if (!requestedApplyOption) {
        status = "failed";
        warnings.push(`申込み番号 ${entry.applyNumber} が選べません`);
      }

      return {
        entryIndex: 0,
        status,
        pageUrl: page.url(),
        pageTitle: await page.title(),
        selectedSportLabel: confirmedSportLabel ?? selectedCategory ?? selectedSportLabel ?? null,
        selectedParkName,
        selectedFacilityName,
        selectedDateLabel: slotSelection.displayDate,
        selectedTimeLabel: slotSelection.displayTime,
        requestedApplyNumber: entry.applyNumber,
        requestedApplyOptionValue: requestedApplyOption?.value ?? null,
        availableApplyOptions: applyOptions,
        warnings,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= PARK_RETRY_COUNT - 1) {
        break;
      }

      await page.waitForTimeout(PARK_LONG_SETTLE_MS * (attempt + 1));
    }
  }

  throw lastError ?? new Error("抽選申込み確認画面の準備に失敗しました");
}

export async function submitTokyoParkLotteryEntry(
  page: Page,
  entryPreview: ParkLotteryEntryPreview,
): Promise<ParkLotteryEntryPreview> {
  if (!entryPreview.requestedApplyOptionValue) {
    return {
      ...entryPreview,
      status: "failed",
      warnings: [...entryPreview.warnings, "申込み番号を確定できませんでした"],
    };
  }

  await page.selectOption("#apply", entryPreview.requestedApplyOptionValue);

  const dialogPromise = page
    .waitForEvent("dialog", { timeout: 5_000 })
    .then((dialog) => dialog.accept())
    .catch(() => undefined);

  await page.click("#btn-go");
  await dialogPromise;
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(PARK_LONG_SETTLE_MS);

  const title = await page.title().catch(() => null);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const looksSuccessful = isParkLotterySubmissionComplete(page.url(), title, bodyText);

  return {
    ...entryPreview,
    status: looksSuccessful ? "submitted" : "failed",
    pageUrl: page.url(),
    pageTitle: title,
    warnings: looksSuccessful
      ? entryPreview.warnings
      : [...entryPreview.warnings, "抽選申込み完了画面を確認できませんでした"],
  };
}

export function summarizeParkAccount(
  account: TokyoParkAccountSecrets,
  entryPreviews: ParkLotteryEntryPreview[],
): ParkLotteryAccountPreview {
  const submittedCount = entryPreviews.filter((entry) => entry.status === "submitted").length;
  const failedCount = entryPreviews.filter((entry) => entry.status === "failed").length;

  return {
    accountLabel: account.label,
    userId: account.userId,
    status: failedCount > 0 ? "failed" : submittedCount > 0 ? "submitted" : "ready",
    entryPreviews,
    warnings: entryPreviews.flatMap((entry) => entry.warnings),
  };
}
