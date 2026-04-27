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

  it("treats blank headers after an inning as additional plate appearances in the same inning", () => {
    const table: RawTable = {
      tableIndex: 2,
      caption: null,
      headers: ["打順", "選手", "守備", "打数", "安打", "打点", "1", "", "2"],
      rows: [
        {
          rowIndex: 1,
          cells: ["1", "伊藤", "三", "1", "0", "1", "四球", "空振三振", "四球"].map((text) => ({
            text,
            controls: [],
          })),
        },
      ],
    };

    const parsed = parseBatterTable(table);
    expect(parsed.batterStats[0].plateAppearanceResults).toEqual([
      {
        appearanceIndex: 1,
        appearanceTurn: 1,
        rawText: "四球",
        normalizedText: "四球",
      },
      {
        appearanceIndex: 1,
        appearanceTurn: 2,
        rawText: "空振三振",
        normalizedText: "空振三振",
      },
      {
        appearanceIndex: 2,
        appearanceTurn: 1,
        rawText: "四球",
        normalizedText: "四球",
      },
    ]);
    expect(parsed.batterStats[0].plateAppearances).toBe(3);
  });
});
