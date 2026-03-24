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
      earnedRuns: control(`MemberScoreDfJiseki[${index}]`, index),
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

function buildPartialInningSourcePreview(runsAllowed: number | null): PitcherSourcePreview {
  return {
    sourceUrl: "https://ts-league.com/game/2026/index.php?gameid=99999",
    pageTitle: "試合結果",
    selectedTableIndex: 1,
    selectedHeaders: ["打順", "選手", "1回"],
    scoreboardTableIndex: 0,
    scoreboardHeaders: ["チーム", "1回"],
    opponentTeam: "Re",
    batterRows: [
      { battingOrder: 1, playerName: "打者1", inningResults: [{ inning: 1, rawText: "中安", events: ["中安"] }] },
      { battingOrder: 2, playerName: "打者2", inningResults: [{ inning: 1, rawText: "左飛", events: ["左飛"] }] },
      { battingOrder: 3, playerName: "打者3", inningResults: [{ inning: 1, rawText: "四球", events: ["四球"] }] },
      { battingOrder: 4, playerName: "打者4", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
      { battingOrder: 5, playerName: "打者5", inningResults: [{ inning: 1, rawText: "二ゴロ", events: ["二ゴロ"] }] },
    ],
    innings: [
      {
        inning: 1,
        runsAllowed,
        hitsAllowed: 1,
        homeRunsAllowed: 0,
        strikeouts: 1,
        walks: 1,
        hitByPitch: 0,
        eventCount: 5,
        rawEvents: ["打者1: 中安", "打者2: 左飛", "打者3: 四球", "打者4: 三振", "打者5: 二ゴロ"],
      },
    ],
    warnings: [],
  };
}

function buildGenericOutSourcePreview(runsAllowed: number | null): PitcherSourcePreview {
  return {
    sourceUrl: "https://ts-league.com/game/2026/index.php?gameid=99998",
    pageTitle: "試合結果",
    selectedTableIndex: 1,
    selectedHeaders: ["打順", "選手", "1回"],
    scoreboardTableIndex: 0,
    scoreboardHeaders: ["チーム", "1回"],
    opponentTeam: "Re",
    batterRows: [
      { battingOrder: 1, playerName: "打者1", inningResults: [{ inning: 1, rawText: "アウト", events: ["アウト"] }] },
      { battingOrder: 2, playerName: "打者2", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
      { battingOrder: 3, playerName: "打者3", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
    ],
    innings: [
      {
        inning: 1,
        runsAllowed,
        hitsAllowed: 0,
        homeRunsAllowed: 0,
        strikeouts: 2,
        walks: 0,
        hitByPitch: 0,
        eventCount: 3,
        rawEvents: ["打者1: アウト", "打者2: 三振", "打者3: 三振"],
      },
    ],
    warnings: [],
  };
}

function buildImplicitOutSourcePreview(): PitcherSourcePreview {
  return {
    sourceUrl: "https://ts-league.com/game/2026/index.php?gameid=99997",
    pageTitle: "試合結果",
    selectedTableIndex: 1,
    selectedHeaders: ["打順", "選手", "1回", "2回"],
    scoreboardTableIndex: 0,
    scoreboardHeaders: ["チーム", "1回", "2回"],
    opponentTeam: "Re",
    batterRows: [
      { battingOrder: 1, playerName: "打者1", inningResults: [{ inning: 1, rawText: "アウト", events: ["アウト"] }] },
      { battingOrder: 2, playerName: "打者2", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
      { battingOrder: 3, playerName: "打者3", inningResults: [{ inning: 2, rawText: "三振", events: ["三振"] }] },
    ],
    innings: [
      {
        inning: 1,
        runsAllowed: 0,
        hitsAllowed: 0,
        homeRunsAllowed: 0,
        strikeouts: 1,
        walks: 0,
        hitByPitch: 0,
        eventCount: 2,
        rawEvents: ["打者1: アウト", "打者2: 三振"],
      },
      {
        inning: 2,
        runsAllowed: 0,
        hitsAllowed: 0,
        homeRunsAllowed: 0,
        strikeouts: 1,
        walks: 0,
        hitByPitch: 0,
        eventCount: 1,
        rawEvents: ["打者3: 三振"],
      },
    ],
    warnings: [],
  };
}

function buildEarnedRunAdjustmentSourcePreview(): PitcherSourcePreview {
  return {
    sourceUrl: "https://ts-league.com/game/2026/index.php?gameid=99996",
    pageTitle: "試合結果",
    selectedTableIndex: 1,
    selectedHeaders: ["打順", "選手", "1回"],
    scoreboardTableIndex: 0,
    scoreboardHeaders: ["チーム", "1回"],
    opponentTeam: "Re",
    batterRows: [
      { battingOrder: 1, playerName: "打者1", inningResults: [{ inning: 1, rawText: "遊失", events: ["遊失"] }] },
      { battingOrder: 2, playerName: "打者2", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
      { battingOrder: 3, playerName: "打者3", inningResults: [{ inning: 1, rawText: "本塁打(2)", events: ["本塁打(2)"] }] },
      { battingOrder: 4, playerName: "打者4", inningResults: [{ inning: 1, rawText: "左飛", events: ["左飛"] }] },
      { battingOrder: 5, playerName: "打者5", inningResults: [{ inning: 1, rawText: "二ゴロ", events: ["二ゴロ"] }] },
    ],
    innings: [
      {
        inning: 1,
        runsAllowed: 2,
        hitsAllowed: 1,
        homeRunsAllowed: 1,
        strikeouts: 1,
        walks: 0,
        hitByPitch: 0,
        eventCount: 5,
        rawEvents: ["打者1: 遊失", "打者2: 三振", "打者3: 本塁打(2)", "打者4: 左飛", "打者5: 二ゴロ"],
      },
    ],
    warnings: [],
  };
}

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

  it("supports mid-inning pitching changes when outs can be assigned from event order", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 2/3", pitcherName: "安楽", innings: 0, outs: 2 },
      { order: 2, rawText: "藤田 1/3", pitcherName: "藤田", innings: 0, outs: 1 },
    ];

    const mapping = buildPitcherMappingPreview(allocations, buildPartialInningSourcePreview(0), {
      ...targetPreview,
      pitcherRows: [pitcherRow(1, options), pitcherRow(2, options)],
    });

    expect(mapping.assignments[0]).toMatchObject({
      targetRowIndex: 1,
      derivedStats: {
        innings: 0,
        outs: 2,
        runsAllowed: 0,
        strikeouts: 1,
        walks: 1,
        hitByPitch: 0,
        hitsAllowed: 1,
        homeRunsAllowed: 0,
      },
    });
    expect(mapping.assignments[1]).toMatchObject({
      targetRowIndex: 2,
      derivedStats: {
        innings: 0,
        outs: 1,
        runsAllowed: 0,
        strikeouts: 0,
        walks: 0,
        hitByPitch: 0,
        hitsAllowed: 0,
        homeRunsAllowed: 0,
      },
    });
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("keeps commit-ready when only runs allowed cannot be attributed safely", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 2/3", pitcherName: "安楽", innings: 0, outs: 2 },
      { order: 2, rawText: "藤田 1/3", pitcherName: "藤田", innings: 0, outs: 1 },
    ];

    const mapping = buildPitcherMappingPreview(allocations, buildPartialInningSourcePreview(1), {
      ...targetPreview,
      pitcherRows: [pitcherRow(1, options), pitcherRow(2, options)],
    });

    expect(mapping.assignments[0].derivedStats.runsAllowed).toBeNull();
    expect(mapping.assignments[0].warnings).toContain("1回の部分イニング失点配分を公開ページから特定できません");
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("treats generic out events as outs when splitting a partial inning", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 2/3", pitcherName: "安楽", innings: 0, outs: 2 },
      { order: 2, rawText: "藤田 1/3", pitcherName: "藤田", innings: 0, outs: 1 },
    ];

    const mapping = buildPitcherMappingPreview(allocations, buildGenericOutSourcePreview(0), {
      ...targetPreview,
      pitcherRows: [pitcherRow(1, options), pitcherRow(2, options)],
    });

    expect(mapping.assignments[0]).toMatchObject({
      inningStart: 1,
      inningEnd: 1,
      derivedStats: {
        innings: 0,
        outs: 2,
        runsAllowed: 0,
        strikeouts: 1,
        walks: 0,
        hitByPitch: 0,
        hitsAllowed: 0,
        homeRunsAllowed: 0,
      },
    });
    expect(mapping.assignments[1]).toMatchObject({
      inningStart: 1,
      inningEnd: 1,
      derivedStats: {
        innings: 0,
        outs: 1,
        runsAllowed: 0,
        strikeouts: 1,
        walks: 0,
        hitByPitch: 0,
        hitsAllowed: 0,
        homeRunsAllowed: 0,
      },
    });
  });

  it("warns when requested pitcher outs do not match the available source outs", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 1回", pitcherName: "安楽", innings: 1, outs: 0 },
      { order: 2, rawText: "藤田 1/3", pitcherName: "藤田", innings: 0, outs: 1 },
    ];

    const mapping = buildPitcherMappingPreview(allocations, buildGenericOutSourcePreview(0), {
      ...targetPreview,
      pitcherRows: [pitcherRow(1, options), pitcherRow(2, options)],
    });

    expect(mapping.warnings).toContain(
      "公開打撃成績から確認できたアウト数は 3アウト (1回) ですが、入力された投手割当は 4アウト (1回1/3) です",
    );
  });

  it("fills a missing non-final inning out so a completed inning stays within that inning", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 1回", pitcherName: "安楽", innings: 1, outs: 0 },
    ];

    const mapping = buildPitcherMappingPreview(allocations, buildImplicitOutSourcePreview(), {
      ...targetPreview,
      pitcherRows: [pitcherRow(1, options)],
    });

    expect(mapping.assignments[0]).toMatchObject({
      inningStart: 1,
      inningEnd: 1,
      derivedStats: {
        innings: 1,
        outs: 0,
        runsAllowed: 0,
        strikeouts: 1,
      },
    });
  });

  it("reduces earned runs when a runner reached on error", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 1回", pitcherName: "安楽", innings: 1, outs: 0 },
    ];

    const mapping = buildPitcherMappingPreview(allocations, buildEarnedRunAdjustmentSourcePreview(), {
      ...targetPreview,
      pitcherRows: [pitcherRow(1, options)],
    });

    expect(mapping.assignments[0]).toMatchObject({
      derivedStats: {
        innings: 1,
        outs: 0,
        earnedRuns: 1,
        runsAllowed: 2,
        strikeouts: 1,
        walks: 0,
        hitByPitch: 0,
        hitsAllowed: 1,
        homeRunsAllowed: 1,
      },
    });
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("stays commit-ready even when an existing pitcher row will be overwritten", () => {
    const allocations: PitcherAllocation[] = [{ order: 1, rawText: "安楽 1回", pitcherName: "安楽", innings: 1, outs: 0 }];
    const row = pitcherRow(1, options);
    row.pitcherLabel = "[17]安楽";
    row.normalizedPitcherLabel = "安楽";
    row.selectedUserId = "14897";
    if (row.pitcherControl) {
      row.pitcherControl.currentValue = "14897";
      row.pitcherControl.currentLabel = "[17]安楽";
    }
    row.statFields.runsAllowed = control("MemberScoreDfSiten[1]", 1, "9");
    row.statFields.strikeouts = control("MemberScoreDfDatusansin[1]", 1, "1");
    row.statFields.walks = control("MemberScoreDfSikyu[1]", 1, "2");

    const mapping = buildPitcherMappingPreview(allocations, buildGenericOutSourcePreview(0), {
      ...targetPreview,
      pitcherRows: [row],
    });

    expect(mapping.warnings).toContain("安楽: existing target runsAllowed would be overwritten");
    expect(mapping.warnings).toContain("安楽: existing target strikeouts would be overwritten");
    expect(mapping.warnings).toContain("安楽: existing target walks would be overwritten");
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("prefers a row that can resolve the pitcher option over the same-order row that cannot", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 3回", pitcherName: "安楽", innings: 3, outs: 0 },
      { order: 2, rawText: "岩本 3回", pitcherName: "岩本", innings: 3, outs: 0 },
    ];
    const row1 = pitcherRow(1, options);
    row1.pitcherLabel = "[17]安楽";
    row1.normalizedPitcherLabel = "安楽";
    row1.selectedUserId = "14897";
    if (row1.pitcherControl) {
      row1.pitcherControl.currentValue = "14897";
      row1.pitcherControl.currentLabel = "[17]安楽";
    }

    const row2 = pitcherRow(2, options);
    const row3 = pitcherRow(3, [
      ...options,
      { value: "14950", label: "[19]岩本", normalizedLabel: "岩本" },
    ]);

    const mapping = buildPitcherMappingPreview(allocations, sourcePreview, {
      ...targetPreview,
      pitcherRows: [row1, row2, row3],
    });

    expect(mapping.assignments[1].targetRowIndex).toBe(3);
    expect(mapping.assignments[1].playerSelection?.targetOptionLabel).toBe("[19]岩本");
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });
});
