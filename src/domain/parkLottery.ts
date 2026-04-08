import type {
  JobInput,
  ParkLotteryAccountPreview,
  ParkLotteryEntryInput,
  TokyoParkAccountSecrets,
} from "./types";

export interface ParkSportOption {
  classCode: string;
  label: string;
}

export const PARK_SPORT_OPTIONS: ParkSportOption[] = [
  { classCode: "100", label: "野球" },
  { classCode: "110", label: "野球（小）" },
  { classCode: "120", label: "テニス（ハード）" },
  { classCode: "130", label: "テニス（人工芝）" },
  { classCode: "140", label: "サッカー・ラグビー・ホッケー" },
  { classCode: "150", label: "サッカー（小）" },
];

function normalizeLooseText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function buildParkLotteryTargetLabel(input: JobInput): string {
  const entries = parseParkEntriesText(input.parkEntriesText);
  if (entries.length === 0) {
    return "都立公園抽選";
  }

  const first = entries[0];
  const firstLabel = [
    first.sportLabel ?? getParkSportLabel(first.sportClassCode) ?? "種目未指定",
    first.parkName,
    first.facilityName,
    formatParkUseDateLabel(first.useDate),
    formatParkTimeRangeLabel(first.startTime, first.endTime),
  ].join(" / ");

  return entries.length === 1 ? firstLabel : `${firstLabel} ほか${entries.length - 1}件`;
}

export function getParkSportLabel(classCode: string | null | undefined): string | null {
  if (!classCode) {
    return null;
  }

  return PARK_SPORT_OPTIONS.find((option) => option.classCode === classCode)?.label ?? null;
}

export function parseParkAccountSelector(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(/[\r\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function selectTokyoParkAccounts(
  accounts: TokyoParkAccountSecrets[],
  selector: string | null | undefined,
): TokyoParkAccountSecrets[] {
  const enabledAccounts = accounts.filter((account) => account.enabled);
  const tokens = parseParkAccountSelector(selector);
  if (tokens.length === 0) {
    return enabledAccounts;
  }

  return enabledAccounts.filter((account) => {
    const label = normalizeLooseText(account.label);
    const userId = normalizeLooseText(account.userId);
    return tokens.some((token) => {
      const normalizedToken = normalizeLooseText(token);
      return normalizedToken === label || normalizedToken === userId;
    });
  });
}

export function normalizeParkUseDate(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const digits = normalized.replace(/[^0-9]/g, "");
  if (digits.length !== 8) {
    return null;
  }

  return digits;
}

export function normalizeParkTimeValue(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const digits = normalized.replace(/[^0-9]/g, "");
  if (digits.length === 3) {
    return `0${digits}`;
  }

  if (digits.length !== 4) {
    return null;
  }

  return digits;
}

export function buildApplyHopeValue(applyNumber: string | null | undefined): string | null {
  const normalized = String(applyNumber ?? "").trim();
  if (normalized !== "1" && normalized !== "2") {
    return null;
  }

  return `${normalized}-1`;
}

export function isParkLotterySubmissionComplete(
  pageUrl: string | null | undefined,
  pageTitle: string | null | undefined,
  bodyText: string | null | undefined,
): boolean {
  const normalizedUrl = String(pageUrl ?? "");
  const normalizedTitle = String(pageTitle ?? "").replace(/\s+/g, " ").trim();
  const normalizedBody = String(bodyText ?? "").replace(/\s+/g, " ").trim();

  if (!normalizedUrl || normalizedUrl.includes("lotWInstTempLotApplyAction.do")) {
    return false;
  }

  if (/申込内容確認画面/.test(normalizedTitle)) {
    return false;
  }

  return /抽選申込み完了|申込み完了|申込みが完了|申込みを受け付けました|抽選申込みを受け付けました|続けて申込み/.test(
    normalizedBody,
  );
}

export function isParkLotteryRecaptchaPrompt(bodyText: string | null | undefined): boolean {
  const normalizedBody = String(bodyText ?? "").replace(/\s+/g, " ").trim();
  return /私はロボットではありません|recaptcha/i.test(normalizedBody);
}

function parseNormalizedParkDate(value: string): Date | null {
  if (!/^\d{8}$/.test(value)) {
    return null;
  }

  const year = Number.parseInt(value.slice(0, 4), 10);
  const monthIndex = Number.parseInt(value.slice(4, 6), 10) - 1;
  const day = Number.parseInt(value.slice(6, 8), 10);
  const parsed = new Date(year, monthIndex, day, 12, 0, 0, 0);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function formatParkUseDateValue(date: Date): string {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
}

function getWeekdayOccurrence(date: Date): number {
  const weekday = date.getDay();
  let occurrence = 0;
  const cursor = new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
  while (cursor <= date) {
    if (cursor.getDay() === weekday) {
      occurrence += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return occurrence;
}

function findNthWeekdayInMonth(year: number, monthIndex: number, weekday: number, occurrence: number): Date | null {
  const matches: Date[] = [];
  const cursor = new Date(year, monthIndex, 1, 12, 0, 0, 0);
  while (cursor.getMonth() === monthIndex) {
    if (cursor.getDay() === weekday) {
      matches.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return matches[Math.min(Math.max(occurrence - 1, 0), matches.length - 1)] ?? null;
}

export function shiftParkUseDateToNextBookingMonth(
  value: string | null | undefined,
  referenceDate: Date = new Date(),
): string | null {
  const normalized = normalizeParkUseDate(value);
  if (!normalized) {
    return null;
  }

  const sourceDate = parseNormalizedParkDate(normalized);
  if (!sourceDate) {
    return null;
  }

  const targetMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1, 12, 0, 0, 0);
  const shiftedDate = findNthWeekdayInMonth(
    targetMonth.getFullYear(),
    targetMonth.getMonth(),
    sourceDate.getDay(),
    getWeekdayOccurrence(sourceDate),
  );
  if (!shiftedDate) {
    return null;
  }

  return formatParkUseDateValue(shiftedDate);
}

function formatParkUseDateLabel(value: string): string {
  if (!/^\d{8}$/.test(value)) {
    return value;
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function formatParkTimeLabel(value: string): string {
  if (!/^\d{4}$/.test(value)) {
    return value;
  }

  return `${value.slice(0, 2)}:${value.slice(2, 4)}`;
}

function formatParkTimeRangeLabel(startTime: string, endTime: string): string {
  return `${formatParkTimeLabel(startTime)}-${formatParkTimeLabel(endTime)}`;
}

export function isParkLotteryCommitReady(accountPreviews: ParkLotteryAccountPreview[]): boolean {
  return (
    accountPreviews.length > 0 &&
    accountPreviews.every(
      (preview) =>
        preview.entryPreviews.length > 0 &&
        preview.entryPreviews.every((entryPreview) => entryPreview.status === "ready"),
    )
  );
}

export function parseParkEntriesText(value: string | null | undefined): ParkLotteryEntryInput[] {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return [];
  }

  let rawEntries: unknown;
  try {
    rawEntries = JSON.parse(normalized);
  } catch {
    return [];
  }

  if (!Array.isArray(rawEntries)) {
    return [];
  }

  return rawEntries
    .map((entry) => normalizeParkEntry(entry))
    .filter((entry): entry is ParkLotteryEntryInput => entry !== null);
}

function normalizeParkEntry(entry: unknown): ParkLotteryEntryInput | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const sportClassCode = String(record.sportClassCode ?? "").trim();
  const parkName = String(record.parkName ?? "").trim();
  const facilityName = String(record.facilityName ?? "").trim();
  const useDate = normalizeParkUseDate(String(record.useDate ?? "").trim());
  const startTime = normalizeParkTimeValue(String(record.startTime ?? "").trim());
  const endTime = normalizeParkTimeValue(String(record.endTime ?? "").trim());
  const applyNumber = String(record.applyNumber ?? "").trim();
  if (!sportClassCode || !parkName || !facilityName || !useDate || !startTime || !endTime || !applyNumber) {
    return null;
  }

  return {
    sportClassCode,
    sportLabel: getParkSportLabel(sportClassCode),
    parkName,
    facilityName,
    useDate,
    startTime,
    endTime,
    applyNumber,
  };
}
