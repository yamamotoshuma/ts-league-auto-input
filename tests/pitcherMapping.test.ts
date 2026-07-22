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

function selectControl(name: string, rowIndex: number, currentValue = "0", currentLabel = "-"): TargetControlRef {
  return {
    ...control(name, rowIndex, currentValue),
    tagName: "select",
    type: "select-one",
    currentLabel,
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
    decisionOptions: [
      { value: "0", label: "-", normalizedLabel: "-" },
      { value: "1", label: "勝ち", normalizedLabel: "勝ち" },
      { value: "2", label: "負け", normalizedLabel: "負け" },
      { value: "3", label: "セーブ", normalizedLabel: "セーブ" },
    ],
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
      decision: selectControl(`MemberScoreDfsyouhai[${index}]`, index),
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

function buildTwoOutErrorBeforeHomerSourcePreview(): PitcherSourcePreview {
  return {
    sourceUrl: "https://ts-league.com/game/2026/index.php?gameid=99995",
    pageTitle: "試合結果",
    selectedTableIndex: 1,
    selectedHeaders: ["打順", "選手", "1回"],
    scoreboardTableIndex: 0,
    scoreboardHeaders: ["チーム", "1回"],
    opponentTeam: "Re",
    batterRows: [
      { battingOrder: 1, playerName: "打者1", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
      { battingOrder: 2, playerName: "打者2", inningResults: [{ inning: 1, rawText: "遊ゴロ", events: ["遊ゴロ"] }] },
      { battingOrder: 3, playerName: "打者3", inningResults: [{ inning: 1, rawText: "遊失", events: ["遊失"] }] },
      { battingOrder: 4, playerName: "打者4", inningResults: [{ inning: 1, rawText: "本塁打(2)", events: ["本塁打(2)"] }] },
      { battingOrder: 5, playerName: "打者5", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
    ],
    innings: [
      {
        inning: 1,
        runsAllowed: 2,
        hitsAllowed: 1,
        homeRunsAllowed: 1,
        strikeouts: 2,
        walks: 0,
        hitByPitch: 0,
        eventCount: 5,
        rawEvents: ["打者1: 三振", "打者2: 遊ゴロ", "打者3: 遊失", "打者4: 本塁打(2)", "打者5: 三振"],
      },
    ],
    warnings: [],
  };
}

function buildDecisionSourcePreview(params: {
  ownRuns: number[];
  opponentRuns: number[];
}): PitcherSourcePreview {
  const innings = params.opponentRuns.map((runsAllowed, index) => ({
    inning: index + 1,
    runsAllowed,
    hitsAllowed: runsAllowed > 0 ? 1 : 0,
    homeRunsAllowed: 0,
    strikeouts: 0,
    walks: 0,
    hitByPitch: 0,
    eventCount: 0,
    rawEvents: [],
  }));

  return {
    sourceUrl: "https://ts-league.com/game/2026/index.php?gameid=99994",
    pageTitle: "試合結果",
    selectedTableIndex: 1,
    selectedHeaders: ["打順", "選手", "1回", "2回", "3回", "4回", "5回", "6回"],
    scoreboardTableIndex: 0,
    scoreboardHeaders: ["チーム", "1回", "2回", "3回", "4回", "5回", "6回"],
    opponentTeam: "Re",
    scoreboardRows: [
      {
        battingSide: "top",
        teamName: "ORDERMADE BASEBALL CLUB",
        runsByInning: params.ownRuns.map((runs, index) => ({ inning: index + 1, runs })),
        totalRuns: params.ownRuns.reduce((sum, runs) => sum + runs, 0),
      },
      {
        battingSide: "bottom",
        teamName: "Re",
        runsByInning: params.opponentRuns.map((runs, index) => ({ inning: index + 1, runs })),
        totalRuns: params.opponentRuns.reduce((sum, runs) => sum + runs, 0),
      },
    ],
    batterRows: [],
    innings,
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

  it("keeps commit-ready and estimates runs allowed when exact partial-inning attribution is unavailable", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 2/3", pitcherName: "安楽", innings: 0, outs: 2 },
      { order: 2, rawText: "藤田 1/3", pitcherName: "藤田", innings: 0, outs: 1 },
    ];

    const mapping = buildPitcherMappingPreview(allocations, buildPartialInningSourcePreview(1), {
      ...targetPreview,
      pitcherRows: [pitcherRow(1, options), pitcherRow(2, options)],
    });

    expect(mapping.assignments[0].derivedStats.runsAllowed).toBe(1);
    expect(mapping.assignments[0].derivedStats.earnedRuns).toBe(1);
    expect(mapping.assignments[0].warnings).toContain("1回の部分イニング失点配分をスコアボードと打撃イベントから概算しました");
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
    expect(mapping.warnings).toContain("藤田: 投手割当に必要なアウト数が公開ページに揃っていません");
    expect(mapping.assignments[1].derivedStats).toMatchObject({
      innings: 0,
      outs: 1,
      earnedRuns: 0,
      runsAllowed: 0,
      strikeouts: 0,
      walks: 0,
      hitByPitch: 0,
      hitsAllowed: 0,
      homeRunsAllowed: 0,
    });
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("counts runner outs as pitcher outs", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 1回", pitcherName: "安楽", innings: 1, outs: 0 },
    ];
    const source = {
      ...buildGenericOutSourcePreview(0),
      batterRows: [
        { battingOrder: 1, playerName: "打者1", inningResults: [{ inning: 1, rawText: "中飛", events: ["中飛"] }] },
        { battingOrder: 2, playerName: "打者2", inningResults: [{ inning: 1, rawText: "走塁死", events: ["走塁死"] }] },
        { battingOrder: 3, playerName: "打者3", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
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
          eventCount: 3,
          rawEvents: ["打者1: 中飛", "打者2: 走塁死", "打者3: 三振"],
        },
      ],
    };

    const mapping = buildPitcherMappingPreview(allocations, source, {
      ...targetPreview,
      pitcherRows: [pitcherRow(1, options)],
    });

    expect(mapping.warnings.some((warning) => warning.includes("アウト数は 2アウト"))).toBe(false);
    expect(isPitcherCommitReady(mapping)).toBe(true);
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

  it("charges an earned run for a bases-loaded walk", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 1回", pitcherName: "安楽", innings: 1, outs: 0 },
    ];
    const source: PitcherSourcePreview = {
      sourceUrl: "https://ts-league.com/game/2026/index.php?gameid=99995",
      pageTitle: "試合結果",
      selectedTableIndex: 1,
      selectedHeaders: ["打順", "選手", "1回"],
      scoreboardTableIndex: 0,
      scoreboardHeaders: ["チーム", "1回"],
      opponentTeam: "Re",
      batterRows: [
        { battingOrder: 1, playerName: "打者1", inningResults: [{ inning: 1, rawText: "四球", events: ["四球"] }] },
        { battingOrder: 2, playerName: "打者2", inningResults: [{ inning: 1, rawText: "四球", events: ["四球"] }] },
        { battingOrder: 3, playerName: "打者3", inningResults: [{ inning: 1, rawText: "四球", events: ["四球"] }] },
        { battingOrder: 4, playerName: "打者4", inningResults: [{ inning: 1, rawText: "四球(1)", events: ["四球(1)"] }] },
        { battingOrder: 5, playerName: "打者5", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
        { battingOrder: 6, playerName: "打者6", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
        { battingOrder: 7, playerName: "打者7", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
      ],
      innings: [
        {
          inning: 1,
          runsAllowed: 1,
          hitsAllowed: 0,
          homeRunsAllowed: 0,
          strikeouts: 3,
          walks: 4,
          hitByPitch: 0,
          eventCount: 7,
          rawEvents: ["打者1: 四球", "打者2: 四球", "打者3: 四球", "打者4: 四球(1)", "打者5: 三振", "打者6: 三振", "打者7: 三振"],
        },
      ],
      warnings: [],
    };

    const mapping = buildPitcherMappingPreview(allocations, source, {
      ...targetPreview,
      pitcherRows: [pitcherRow(1, options)],
    });

    expect(mapping.assignments[0]).toMatchObject({
      derivedStats: {
        earnedRuns: 1,
        runsAllowed: 1,
        walks: 4,
      },
    });
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("honors explicit runs on walks when the inning needs earned-run reconstruction", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 1回", pitcherName: "安楽", innings: 1, outs: 0 },
    ];
    const source: PitcherSourcePreview = {
      sourceUrl: "https://ts-league.com/game/2026/index.php?gameid=99994",
      pageTitle: "試合結果",
      selectedTableIndex: 1,
      selectedHeaders: ["打順", "選手", "1回"],
      scoreboardTableIndex: 0,
      scoreboardHeaders: ["チーム", "1回"],
      opponentTeam: "Re",
      batterRows: [
        { battingOrder: 1, playerName: "打者1", inningResults: [{ inning: 1, rawText: "四球", events: ["四球", "盗塁"] }] },
        { battingOrder: 2, playerName: "打者2", inningResults: [{ inning: 1, rawText: "四球", events: ["四球", "盗塁"] }] },
        { battingOrder: 3, playerName: "打者3", inningResults: [{ inning: 1, rawText: "四球", events: ["四球(1)", "敵失"] }] },
        { battingOrder: 4, playerName: "打者4", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
        { battingOrder: 5, playerName: "打者5", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
        { battingOrder: 6, playerName: "打者6", inningResults: [{ inning: 1, rawText: "三振", events: ["三振"] }] },
      ],
      innings: [
        {
          inning: 1,
          runsAllowed: 1,
          hitsAllowed: 0,
          homeRunsAllowed: 0,
          strikeouts: 3,
          walks: 3,
          hitByPitch: 0,
          eventCount: 8,
          rawEvents: ["打者1: 四球", "打者1: 盗塁", "打者2: 四球", "打者2: 盗塁", "打者3: 四球(1)", "打者3: 敵失", "打者4: 三振", "打者5: 三振", "打者6: 三振"],
        },
      ],
      warnings: [],
    };

    const mapping = buildPitcherMappingPreview(allocations, source, {
      ...targetPreview,
      pitcherRows: [pitcherRow(1, options)],
    });

    expect(mapping.assignments[0]).toMatchObject({
      derivedStats: {
        earnedRuns: 1,
        runsAllowed: 1,
        walks: 3,
      },
    });
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("does not charge earned runs after a two-out error should have ended the reconstructed inning", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 1回", pitcherName: "安楽", innings: 1, outs: 0 },
    ];

    const mapping = buildPitcherMappingPreview(allocations, buildTwoOutErrorBeforeHomerSourcePreview(), {
      ...targetPreview,
      pitcherRows: [pitcherRow(1, options)],
    });

    expect(mapping.assignments[0]).toMatchObject({
      derivedStats: {
        innings: 1,
        outs: 0,
        earnedRuns: 0,
        runsAllowed: 2,
        strikeouts: 2,
        walks: 0,
        hitByPitch: 0,
        hitsAllowed: 1,
        homeRunsAllowed: 1,
      },
    });
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("assigns the win decision to a starter who satisfies the Skytree League 3-inning responsibility rule", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 3回", pitcherName: "安楽", innings: 3, outs: 0 },
      { order: 2, rawText: "藤田 3回", pitcherName: "藤田", innings: 3, outs: 0 },
    ];

    const mapping = buildPitcherMappingPreview(
      allocations,
      buildDecisionSourcePreview({
        ownRuns: [0, 0, 4, 0, 0, 0],
        opponentRuns: [0, 0, 1, 0, 0, 0],
      }),
      {
        ...targetPreview,
        pitcherRows: [pitcherRow(1, options), pitcherRow(2, options)],
      },
    );

    expect(mapping.assignments[0].derivedStats.decision).toBe("win");
    expect(mapping.assignments[0].decisionSelection?.targetOptionLabel).toBe("勝ち");
    expect(mapping.assignments[1].derivedStats.decision).toBeNull();
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("falls back to a reliever when the starter does not satisfy the Skytree League responsibility rule", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 2回", pitcherName: "安楽", innings: 2, outs: 0 },
      { order: 2, rawText: "藤田 4回", pitcherName: "藤田", innings: 4, outs: 0 },
    ];

    const mapping = buildPitcherMappingPreview(
      allocations,
      buildDecisionSourcePreview({
        ownRuns: [0, 4, 0, 0, 0, 0],
        opponentRuns: [0, 1, 0, 0, 0, 0],
      }),
      {
        ...targetPreview,
        pitcherRows: [pitcherRow(1, options), pitcherRow(2, options)],
      },
    );

    expect(mapping.assignments[0].derivedStats.decision).toBeNull();
    expect(mapping.assignments[1].derivedStats.decision).toBe("win");
    expect(mapping.assignments[1].decisionSelection?.targetOptionLabel).toBe("勝ち");
    expect(mapping.warnings).toContain("藤田: 先発投手がスカイツリーグの責任投球回を満たさないため、救援投手から勝利投手を概算しました");
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("uses half-or-more innings rounded up for a four-inning Skytree League game", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 2回", pitcherName: "安楽", innings: 2, outs: 0 },
      { order: 2, rawText: "藤田 2回", pitcherName: "藤田", innings: 2, outs: 0 },
    ];

    const mapping = buildPitcherMappingPreview(
      allocations,
      buildDecisionSourcePreview({
        ownRuns: [0, 3, 0, 0],
        opponentRuns: [0, 1, 0, 0],
      }),
      {
        ...targetPreview,
        pitcherRows: [pitcherRow(1, options), pitcherRow(2, options)],
      },
    );

    expect(mapping.assignments[0].derivedStats.decision).toBe("win");
    expect(mapping.assignments[0].decisionSelection?.targetOptionLabel).toBe("勝ち");
    expect(mapping.assignments[1].derivedStats.decision).toBeNull();
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("assigns the loss decision to the pitcher who allowed the final go-ahead inning", () => {
    const allocations: PitcherAllocation[] = [
      { order: 1, rawText: "安楽 3回", pitcherName: "安楽", innings: 3, outs: 0 },
      { order: 2, rawText: "藤田 3回", pitcherName: "藤田", innings: 3, outs: 0 },
    ];

    const mapping = buildPitcherMappingPreview(
      allocations,
      buildDecisionSourcePreview({
        ownRuns: [1, 0, 0, 0, 0, 0],
        opponentRuns: [0, 2, 0, 0, 0, 0],
      }),
      {
        ...targetPreview,
        pitcherRows: [pitcherRow(1, options), pitcherRow(2, options)],
      },
    );

    expect(mapping.assignments[0].derivedStats.decision).toBe("loss");
    expect(mapping.assignments[0].decisionSelection?.targetOptionLabel).toBe("負け");
    expect(mapping.assignments[1].derivedStats.decision).toBeNull();
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("ignores batting events beyond the final played scoreboard inning", () => {
    const source = buildDecisionSourcePreview({
      ownRuns: [1, 0, 0, 0, 4],
      opponentRuns: [1, 1, 5, 4, 0],
    });
    source.batterRows = [1, 2, 3].map((battingOrder) => ({
      battingOrder,
      playerName: `打者${battingOrder}`,
      inningResults: [1, 2, 3, 4, 5, 6].map((inning) => ({
        inning,
        rawText: "アウト",
        events: ["アウト"],
      })),
    }));

    const mapping = buildPitcherMappingPreview(
      [
        { order: 1, rawText: "安楽 3回", pitcherName: "安楽", innings: 3, outs: 0 },
        { order: 2, rawText: "藤田 2回", pitcherName: "藤田", innings: 2, outs: 0 },
      ],
      source,
      {
        ...targetPreview,
        pitcherRows: [pitcherRow(1, options), pitcherRow(2, options)],
      },
    );

    expect(mapping.warnings).not.toContain(
      "公開打撃成績から確認できたアウト数は 18アウト (6回) ですが、入力された投手割当は 15アウト (5回) です",
    );
    expect(mapping.assignments[0].decisionSelection?.targetOptionLabel).toBe("負け");
    expect(isPitcherCommitReady(mapping)).toBe(true);
  });

  it("fills a missing final out when the opponent is top and the bottom half was played", () => {
    const source = buildDecisionSourcePreview({
      ownRuns: [1, 0, 0, 0, 4],
      opponentRuns: [1, 1, 5, 4, 0],
    });
    const [ownRow, opponentRow] = source.scoreboardRows ?? [];
    source.scoreboardRows = [
      { ...opponentRow, battingSide: "top" },
      { ...ownRow, battingSide: "bottom" },
    ];
    source.batterRows = [
      {
        battingOrder: 1,
        playerName: "打者1",
        inningResults: [1, 2, 3, 4, 5, 6].map((inning) => ({ inning, rawText: "アウト", events: ["アウト"] })),
      },
      {
        battingOrder: 2,
        playerName: "打者2",
        inningResults: [1, 2, 3, 4].map((inning) => ({ inning, rawText: "アウト", events: ["アウト"] })).concat([
          { inning: 5, rawText: "敵失", events: ["敵失"] },
          { inning: 6, rawText: "アウト", events: ["アウト"] },
        ]),
      },
      {
        battingOrder: 3,
        playerName: "打者3",
        inningResults: [1, 2, 3, 4, 5, 6].map((inning) => ({ inning, rawText: "アウト", events: ["アウト"] })),
      },
    ];

    const mapping = buildPitcherMappingPreview(
      [
        { order: 1, rawText: "安楽 3回", pitcherName: "安楽", innings: 3, outs: 0 },
        { order: 2, rawText: "藤田 2回", pitcherName: "藤田", innings: 2, outs: 0 },
      ],
      source,
      {
        ...targetPreview,
        pitcherRows: [pitcherRow(1, options), pitcherRow(2, options)],
      },
    );

    expect(mapping.warnings.some((warning) => warning.includes("投手割当に必要なアウト数"))).toBe(false);
    expect(mapping.assignments[0].decisionSelection?.targetOptionLabel).toBe("負け");
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
