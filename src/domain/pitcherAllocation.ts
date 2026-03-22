import type { PitcherAllocation } from "./types";
import { normalizeText } from "../utils/nameNormalizer";

function parseOuts(fragment: string | undefined): number {
  if (!fragment) {
    return 0;
  }

  const normalized = normalizeText(fragment).replaceAll(" ", "");
  if (normalized === "1/3" || normalized === ".1") {
    return 1;
  }

  if (normalized === "2/3" || normalized === ".2") {
    return 2;
  }

  throw new Error(`対応していない端数です: ${fragment}`);
}

function parseLine(line: string, order: number): PitcherAllocation {
  const normalized = normalizeText(line);
  const match = normalized.match(/^(.+?)\s+(\d+)(?:回)?(?:\s*(1\/3|2\/3)|\.(1|2))?$/);
  if (!match) {
    throw new Error("`投手名 3回` の形式で入力してください");
  }

  const pitcherName = normalizeText(match[1]);
  const innings = Number.parseInt(match[2], 10);
  const outs = parseOuts(match[3] ?? (match[4] ? `.${match[4]}` : undefined));

  if (!pitcherName) {
    throw new Error("投手名が空です");
  }

  if (Number.isNaN(innings)) {
    throw new Error("回数を解釈できません");
  }

  if (innings === 0 && outs === 0) {
    throw new Error("0回は入力できません");
  }

  return {
    order,
    rawText: normalized,
    pitcherName,
    innings,
    outs,
  };
}

export function parsePitcherAllocationText(value: string): PitcherAllocation[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("投手割当を1行以上入力してください");
  }

  return lines.map((line, index) => {
    try {
      return parseLine(line, index + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "投手割当の解釈に失敗しました";
      throw new Error(`${index + 1}行目: ${message}`);
    }
  });
}
