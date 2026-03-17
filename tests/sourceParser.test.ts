import { describe, expect, it } from "vitest";
import { parseBatterTable, selectLikelyBatterTable } from "../src/domain/sourceParser";
import type { RawTable } from "../src/domain/types";

const batterTable: RawTable = {
  tableIndex: 0,
  caption: null,
  headers: ["打順", "選手", "守備", "打数", "得点", "安打", "打点", "四球", "三振", "盗塁"],
  rows: [
    {
      rowIndex: 1,
      cells: ["1", "山田 太郎", "遊", "4", "1", "2", "1", "0", "1", "1"].map((text) => ({
        text,
        controls: [],
      })),
    },
  ],
};

const pitcherTable: RawTable = {
  tableIndex: 1,
  caption: null,
  headers: ["投手", "回", "失点", "自責"],
  rows: [],
};

describe("selectLikelyBatterTable", () => {
  it("prefers batter-like headers", () => {
    expect(selectLikelyBatterTable([pitcherTable, batterTable])?.tableIndex).toBe(0);
  });
});

describe("parseBatterTable", () => {
  it("maps raw table rows to batter stats", () => {
    const parsed = parseBatterTable(batterTable);
    expect(parsed.batterStats).toHaveLength(1);
    expect(parsed.batterStats[0]).toMatchObject({
      playerName: "山田 太郎",
      battingOrder: 1,
      position: "遊",
      atBats: 4,
      hits: 2,
      runs: 1,
      rbi: 1,
      walks: 0,
      strikeouts: 1,
      stolenBases: 1,
    });
  });
});

