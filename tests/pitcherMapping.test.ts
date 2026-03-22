import { describe, expect, it } from "vitest";
import { buildPitcherMappingPreview, isPitcherCommitReady } from "../src/domain/pitcherMapping";
import type {
  PitcherAllocation,
  PitcherSourcePreview,
  PitcherTargetFormPreview,
  PitcherTargetRow,
  TargetControlRef,
  TargetSelectOption,
} from "../src/domain/types";

function control(name: string, rowIndex: number, currentValue = ""): TargetControlRef {
  return {
    formIndex: 0,
    tableIndex: -1,
    rowIndex,
    cellIndex: -1,
    controlIndex: -1,
    headerText: name,
    tagName: "input",
    type: "text",
    name,
    id: null,
    currentValue,
  };
}

function pitcherRow(index: number, options: TargetSelectOption[]): PitcherTargetRow {
  return {
    formIndex: 0,
    rowIndex: index,
    pitcherIndex: index,
    pitcherLabel: "-",
    normalizedPitcherLabel: "",
    selectedUserId: "0",
    pitcherControl: {
      formIndex: 0,
      tableIndex: -1,
      rowIndex: index,
      cellIndex: -1,
      controlIndex: -1,
      headerText: "投手",
      tagName: "select",
      type: "select-one",
      name: `MemberScoreDfUserId[${index}]`,
      id: null,
      currentValue: "0",
      currentLabel: "-",
    },
    pitcherOptions: options,
    statFields: {
      innings: control(`MemberScoreDfIning[${index}]`, index),
      outs: control(`MemberScoreDfKaisu[${index}]`, index),
      runsAllowed: control(`MemberScoreDfSiten[${index}]`, index),
      strikeouts: control(`MemberScoreDfDatusansin[${index}]`, index),
      walks: control(`MemberScoreDfSikyu[${index}]`, index),
      hitByPitch: control(`MemberScoreDfSisikyu[${index}]`, index),
      hitsAllowed: control(`MemberScoreDfHianda[${index}]`, index),
      homeRunsAllowed: control(`MemberScoreDfHiHr[${index}]`, index),
    },
  };
}

const options: TargetSelectOption[] = [
  { value: "0", label: "-", normalizedLabel: "-" },
  { value: "14897", label: "[17]安楽", normalizedLabel: "安楽" },
  { value: "14898", label: "[18]藤田", normalizedLabel: "藤田" },
];

const targetPreview: PitcherTargetFormPreview = {
  pageUrl: "https://ts-league.com/team/order-made/gamedf_edit.php",
  pageTitle: "投手成績編集",
  selectedFormIndex: 0,
  action: "gamedf_edit_complete.php",
  method: "post",
  availableForms: [],
  hiddenInputs: [],
  pitcherRows: [pitcherRow(1, options), pitcherRow(2, options)],
};

const sourcePreview: PitcherSourcePreview = {
  sourceUrl: "https://ts-league.com/game/2026/index.php?gameid=14248",
  pageTitle: "試合結果",
  selectedTableIndex: 5,
  selectedHeaders: ["打順", "選手", "1回", "2回", "3回", "4回", "5回", "6回"],
  scoreboardTableIndex: 0,
  scoreboardHeaders: ["チーム", "1回", "2回", "3回", "4回", "5回", "6回"],
  opponentTeam: "Re",
  batterRows: [],
  innings: [
    { inning: 1, runsAllowed: 0, hitsAllowed: 1, homeRunsAllowed: 0, strikeouts: 2, walks: 1, hitByPitch: 0, eventCount: 4, rawEvents: [] },
    { inning: 2, runsAllowed: 2, hitsAllowed: 1, homeRunsAllowed: 0, strikeouts: 3, walks: 0, hitByPitch: 1, eventCount: 5, rawEvents: [] },
    { inning: 3, runsAllowed: 1, hitsAllowed: 0, homeRunsAllowed: 0, strikeouts: 2, walks: 2, hitByPitch: 0, eventCount: 4, rawEvents: [] },
    { inning: 4, runsAllowed: 3, hitsAllowed: 2, homeRunsAllowed: 1, strikeouts: 0, walks: 1, hitByPitch: 0, eventCount: 5, rawEvents: [] },
    { inning: 5, runsAllowed: 0, hitsAllowed: 0, homeRunsAllowed: 0, strikeouts: 1, walks: 0, hitByPitch: 0, eventCount: 3, rawEvents: [] },
    { inning: 6, runsAllowed: 0, hitsAllowed: 1, homeRunsAllowed: 0, strikeouts: 1, walks: 1, hitByPitch: 0, eventCount: 4, rawEvents: [] },
  ],
  warnings: [],
};

describe("buildPitcherMappingPreview", () => {
  it("maps empty target rows in input order and derives per-pitcher totals", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 3回", pitcherName: "安楽", innings: 3, outs: 0 },
      { order: 2, rawText: "藤田 3回", pitcherName: "藤田", innings: 3, outs: 0 },
    ];

    const mapping = buildPitcherMappingPreview(allocations, sourcePreview, targetPreview);

    expect(mapping.assignments[0]).toMatchObject({
      targetRowIndex: 1,
      targetPitcherLabel: "[17]安楽",
      derivedStats: {
        innings: 3,
        outs: 0,
        runsAllowed: 3,
        strikeouts: 7,
        walks: 3,
        hitByPitch: 1,
        hitsAllowed: 2,
        homeRunsAllowed: 0,
      },
    });
    expect(mapping.assignments[1]).toMatchObject({
      targetRowIndex: 2,
      targetPitcherLabel: "[18]藤田",
      derivedStats: {
        innings: 3,
        outs: 0,
        runsAllowed: 3,
        strikeouts: 2,
        walks: 2,
        hitByPitch: 0,
        hitsAllowed: 3,
        homeRunsAllowed: 1,
      },
    });
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("marks fractional allocations as not commit-ready", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 3.1", pitcherName: "安楽", innings: 3, outs: 1 },
    ];

    const mapping = buildPitcherMappingPreview(allocations, sourcePreview, {
      ...targetPreview,
      pitcherRows: [pitcherRow(1, options)],
    });

    expect(mapping.assignments[0].warnings).toContain("部分イニングの配賦はまだ対応していません");
    expect(isPitcherCommitReady(mapping)).toBe(false);
  });
});
