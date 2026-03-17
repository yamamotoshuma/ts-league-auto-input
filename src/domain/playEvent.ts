import type { BatterStat, PlateAppearanceResult, TargetEventOption } from "./types";
import { normalizeLooseKey, normalizeText } from "../utils/nameNormalizer";

const POSITION_PREFIX_MAP: Record<string, string> = {
  投: "投",
  捕: "捕",
  一: "一",
  二: "ニ",
  三: "三",
  遊: "遊",
  左: "左",
  中: "中",
  右: "右",
};

export function normalizePosition(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeText(value).replace(/[()（）]/g, "");
  return normalized === "" ? null : normalized;
}

export function isPlateAppearanceHeader(header: string): boolean {
  return /^\d+$/.test(normalizeText(header));
}

export function extractPlateAppearanceResults(headers: string[], rowValues: string[]): PlateAppearanceResult[] {
  const results: PlateAppearanceResult[] = [];

  headers.forEach((header, index) => {
    if (!isPlateAppearanceHeader(header)) {
      return;
    }

    const rawText = normalizeText(rowValues[index] ?? "");
    if (rawText === "") {
      return;
    }

    results.push({
      appearanceIndex: Number.parseInt(header, 10),
      rawText,
      normalizedText: normalizeLooseKey(rawText),
    });
  });

  return results;
}

function countMatches(plateAppearanceResults: PlateAppearanceResult[], matcher: (value: string) => boolean): number | null {
  if (plateAppearanceResults.length === 0) {
    return null;
  }

  return plateAppearanceResults.filter((result) => matcher(result.rawText)).length;
}

export function deriveSupplementalStats(stat: BatterStat): Partial<BatterStat> {
  const results = stat.plateAppearanceResults;

  return {
    plateAppearances: stat.plateAppearances ?? (results.length > 0 ? results.length : null),
    walks:
      stat.walks ??
      countMatches(results, (value) => value.includes("四球") || value.includes("敬遠")),
    hitByPitch: stat.hitByPitch ?? countMatches(results, (value) => value.includes("死球")),
    strikeouts:
      stat.strikeouts ?? countMatches(results, (value) => value.includes("三振") || value.includes("振逃")),
    doubles: stat.doubles ?? countMatches(results, (value) => /二塁打/.test(value)),
    triples: stat.triples ?? countMatches(results, (value) => /三塁打/.test(value)),
    homeRuns: stat.homeRuns ?? countMatches(results, (value) => /本塁打/.test(value)),
    sacrificeBunts: stat.sacrificeBunts ?? countMatches(results, (value) => value.includes("犠打")),
    sacrificeFlies: stat.sacrificeFlies ?? countMatches(results, (value) => value.includes("犠飛")),
    stolenBases:
      stat.stolenBases ??
      countMatches(results, (value) => value.includes("盗塁") && !value.includes("盗塁死")),
  };
}

function normalizeTargetEventLabel(label: string): string {
  return normalizeText(label)
    .replace(/安２/g, "2")
    .replace(/安３/g, "3")
    .replace(/[２]/g, "2")
    .replace(/[３]/g, "3");
}

function getNormalizedTargetEventCandidates(sourceText: string): string[] {
  return getTargetEventLabelCandidates(sourceText).map(normalizeTargetEventLabel);
}

function convertPrefix(prefix: string): string {
  return POSITION_PREFIX_MAP[prefix] ?? prefix;
}

export function getTargetEventLabelCandidates(sourceText: string): string[] {
  const normalized = normalizeText(sourceText);
  if (normalized === "") {
    return [];
  }

  if (normalized.includes("敬遠")) {
    return ["敬遠", "四球"];
  }

  if (normalized.includes("四球")) {
    return ["四球"];
  }

  if (normalized.includes("死球")) {
    return ["死球"];
  }

  if (normalized.includes("見逃三振")) {
    return ["見三振", "三振"];
  }

  if (normalized.includes("空振三振")) {
    return ["空三振", "三振"];
  }

  if (normalized.includes("三振")) {
    return ["三振"];
  }

  if (normalized.includes("振逃")) {
    return ["振逃"];
  }

  if (normalized === "安打") {
    return ["安打"];
  }

  if (normalized === "内安" || normalized === "内野安打") {
    return ["内安"];
  }

  const prefixMatch = normalized.match(/^(投|捕|一|二|三|遊|左|中|右)/);
  const prefix = prefixMatch ? convertPrefix(prefixMatch[1]) : "";

  if (normalized.includes("本塁打")) {
    return prefix ? [`${prefix}本`, "本塁打"] : ["本塁打"];
  }

  if (normalized.includes("三塁打")) {
    return prefix ? [`${prefix}3`, `${prefix}３`, "安３"] : ["安３"];
  }

  if (normalized.includes("二塁打")) {
    return prefix ? [`${prefix}2`, `${prefix}２`, "安２"] : ["安２"];
  }

  if (normalized.includes("安打")) {
    return prefix ? [`${prefix}安`, "安打"] : ["安打"];
  }

  if (normalized.includes("エラー")) {
    return prefix ? [`${prefix}失`, "敵失"] : ["敵失"];
  }

  if (normalized.includes("犠飛")) {
    return prefix ? [`${prefix}犠飛`, "犠飛"] : ["犠飛"];
  }

  if (normalized.includes("犠打")) {
    return prefix ? [`${prefix}犠打`, "犠打"] : ["犠打"];
  }

  if (normalized.includes("フライ")) {
    return prefix ? [`${prefix}飛`, "ア飛"] : ["ア飛"];
  }

  if (normalized.includes("ライナー")) {
    return prefix ? [`${prefix}直`, "ア直"] : ["ア直"];
  }

  if (normalized.includes("ゴロ")) {
    return prefix ? [`${prefix}ゴ`, "アゴ"] : ["アゴ"];
  }

  if (normalized.includes("野選")) {
    return prefix ? [`${prefix}選`, "野選"] : ["野選"];
  }

  return [normalized];
}

export function findTargetEventOption(
  sourceText: string,
  options: TargetEventOption[],
): TargetEventOption | null {
  const candidateLabels = getNormalizedTargetEventCandidates(sourceText);
  const normalizedOptions = options.map((option) => ({
    option,
    normalizedLabel: normalizeTargetEventLabel(option.label),
  }));

  for (const candidate of candidateLabels) {
    const exact = normalizedOptions.find((item) => item.normalizedLabel === candidate);
    if (exact) {
      return exact.option;
    }
  }

  for (const candidate of candidateLabels) {
    const partial = normalizedOptions.find((item) => item.normalizedLabel.includes(candidate));
    if (partial) {
      return partial.option;
    }
  }

  return null;
}

export function isTargetEventLabelCompatible(sourceText: string, targetLabel: string | null): boolean {
  if (!targetLabel) {
    return false;
  }

  const normalizedTargetLabel = normalizeTargetEventLabel(targetLabel);
  return getNormalizedTargetEventCandidates(sourceText).some(
    (candidate) =>
      normalizedTargetLabel === candidate ||
      normalizedTargetLabel.includes(candidate) ||
      candidate.includes(normalizedTargetLabel),
  );
}
