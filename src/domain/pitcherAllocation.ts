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

function parseInningFragment(fragment: string): { innings: number; outs: number } {
  const normalized = normalizeText(fragment).replaceAll(" ", "");

  if (/^\d+$/.test(normalized)) {
    return {
      innings: Number.parseInt(normalized, 10),
      outs: 0,
    };
  }

  if (/^\d+回$/.test(normalized)) {
    return {
      innings: Number.parseInt(normalized.replace(/回$/, ""), 10),
      outs: 0,
    };
  }

  if (/^(1\/3|2\/3)(?:回)?$/.test(normalized)) {
    return {
      innings: 0,
      outs: parseOuts(normalized.replace(/回$/, "")),
    };
  }

  const decimalMatch = normalized.match(/^(\d+)\.(1|2)$/);
  if (decimalMatch) {
    return {
      innings: Number.parseInt(decimalMatch[1], 10),
      outs: parseOuts(`.${decimalMatch[2]}`),
    };
  }

  const mixedMatch = normalized.match(/^(\d+)(?:回)?(1\/3|2\/3)$/);
  if (mixedMatch) {
    return {
      innings: Number.parseInt(mixedMatch[1], 10),
      outs: parseOuts(mixedMatch[2]),
    };
  }

  throw new Error("`投手名 3回` の形式で入力してください");
}

function parseLine(line: string, order: number): PitcherAllocation {
  const normalized = normalizeText(line);
  const match = normalized.match(/^(.+?)\s+(.+)$/);
  if (!match) {
    throw new Error("`投手名 3回` の形式で入力してください");
  }

  const pitcherName = normalizeText(match[1]);
  const { innings, outs } = parseInningFragment(match[2]);

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
