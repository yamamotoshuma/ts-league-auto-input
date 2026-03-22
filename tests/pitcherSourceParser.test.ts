import { describe, expect, it } from "vitest";
import { buildPitcherSourcePreview } from "../src/domain/pitcherSourceParser";
import type { RawTable, TableSnapshot } from "../src/domain/types";

function cell(text: string) {
  return {
    text,
    controls: [],
  };
}

const scoreboardTable: RawTable = {
  tableIndex: 0,
  caption: null,
  contextText: "試合経過",
  headers: ["チーム", "1回", "2回", "3回"],
  rows: [
    {
      rowIndex: 1,
      cells: [cell("ORDERMADE"), cell("0"), cell("0"), cell("0")],
    },
    {
      rowIndex: 2,
      cells: [cell("Ｒｅ"), cell("1"), cell("0"), cell("2")],
    },
  ],
};

const opponentBattingTable: RawTable = {
  tableIndex: 1,
  caption: null,
  contextText: "Ｒｅ 打撃成績",
  headers: ["打順", "選手", "1回", "2回", "3回"],
  rows: [
    {
      rowIndex: 1,
      cells: [cell("1"), cell("ＳＯ－ＴＡ"), cell("四球"), cell(""), cell("三振")],
    },
    {
      rowIndex: 2,
      cells: [cell("2"), cell("ＴＡＫＡＨＡＳＨＩ"), cell("中安"), cell("死球"), cell("中本")],
    },
    {
      rowIndex: 3,
      cells: [cell("計"), cell(""), cell(""), cell(""), cell("")],
    },
  ],
};

const snapshot: TableSnapshot = {
  url: "https://ts-league.com/game/2026/index.php?gameid=14248",
  title: "試合結果",
  tables: [scoreboardTable, opponentBattingTable],
};

const combinedBattingTable: RawTable = {
  tableIndex: 5,
  caption: null,
  contextText: "打撃成績一覧",
  headers: ["打順", "選手名", "経験", "OPS", "打率", "守備", "打点", "得点", "盗塁", "盗失", "失策", "美技", "1回", "2回", "3回"],
  rows: [
    {
      rowIndex: 1,
      cells: ["1", "", "伊藤(4)395 view", "高", "-", ".___", "遊", "0", "0", "0", "0", "0", "0", "ニゴ", "", ""].map(cell),
    },
    {
      rowIndex: 2,
      cells: ["先攻", "", "ORDERMADE BASEBALL CLUB", "3", "0", "0", "3"].map(cell),
    },
    {
      rowIndex: 3,
      cells: ["後攻", "", "Ｒｅ", "6", "0", "1", "2"].map(cell),
    },
    {
      rowIndex: 4,
      cells: ["打順", "選手名", "経験", "OPS", "打率", "守備", "打点", "得点", "盗塁", "盗失", "失策", "美技", "1回", "2回", "3回"].map(cell),
    },
    {
      rowIndex: 5,
      cells: ["1", "", "ＳＯ－ＴＡ(0)38 view", "中", "-", ".333", "遊", "0", "1", "0", "0", "0", "0", "死球", "", "四球"].map(cell),
    },
    {
      rowIndex: 6,
      cells: ["2", "", "ＴＡＫＡＨＡＳＨＩ(8)25 view", "中", "-", ".333", "DH", "1", "1", "0", "0", "0", "0", "四球", "", "投安(1)"].map(cell),
    },
  ],
};

const combinedSnapshot: TableSnapshot = {
  url: "https://ts-league.com/game/2026/index.php?gameid=14248",
  title: "試合結果",
  tables: [combinedBattingTable],
};

describe("buildPitcherSourcePreview", () => {
  it("aggregates opponent batting events by inning", () => {
    const preview = buildPitcherSourcePreview(snapshot, "Re");

    expect(preview.selectedTableIndex).toBe(1);
    expect(preview.scoreboardTableIndex).toBe(0);
    expect(preview.innings).toEqual([
      expect.objectContaining({
        inning: 1,
        runsAllowed: 1,
        hitsAllowed: 1,
        homeRunsAllowed: 0,
        walks: 1,
        hitByPitch: 0,
        strikeouts: 0,
      }),
      expect.objectContaining({
        inning: 2,
        runsAllowed: 0,
        hitsAllowed: 0,
        homeRunsAllowed: 0,
        walks: 0,
        hitByPitch: 1,
        strikeouts: 0,
      }),
      expect.objectContaining({
        inning: 3,
        runsAllowed: 2,
        hitsAllowed: 1,
        homeRunsAllowed: 1,
        walks: 0,
        hitByPitch: 0,
        strikeouts: 1,
      }),
    ]);
    expect(preview.warnings).toHaveLength(0);
  });

  it("parses the live-style combined batting table that contains both teams", () => {
    const preview = buildPitcherSourcePreview(combinedSnapshot, "Re");

    expect(preview.selectedTableIndex).toBe(5);
    expect(preview.scoreboardTableIndex).toBe(5);
    expect(preview.batterRows.map((row) => row.playerName)).toEqual(["SO-TA", "TAKAHASHI"]);
    expect(preview.innings).toEqual([
      expect.objectContaining({
        inning: 1,
        runsAllowed: 0,
        walks: 1,
        hitByPitch: 1,
        hitsAllowed: 0,
      }),
      expect.objectContaining({
        inning: 3,
        runsAllowed: 2,
        walks: 1,
        hitByPitch: 0,
        hitsAllowed: 1,
      }),
    ]);
  });
});
