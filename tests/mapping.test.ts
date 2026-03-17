import { describe, expect, it } from "vitest";
import { buildMappingPreview, isCommitReady, verifyAppliedMapping } from "../src/domain/mapping";
import type { BatterStat, TargetFormPreview, TargetPlayerRow } from "../src/domain/types";

function createTargetRow(overrides?: Partial<TargetPlayerRow>): TargetPlayerRow {
  return {
    formIndex: 0,
    tableIndex: -1,
    rowIndex: 1,
    lineupIndex: 1,
    playerLabel: "[10]山田太郎",
    normalizedPlayerLabel: "山田太郎",
    selectedUserId: "10",
    selectedPositionLabel: "遊",
    statFields: {
      rbi: {
        formIndex: 0,
        tableIndex: -1,
        rowIndex: 1,
        cellIndex: -1,
        controlIndex: -1,
        headerText: "打点",
        tagName: "input",
        type: "text",
        name: "MemberScoreOfDaten[1]",
        id: null,
        currentValue: "",
      },
      runs: {
        formIndex: 0,
        tableIndex: -1,
        rowIndex: 1,
        cellIndex: -1,
        controlIndex: -1,
        headerText: "得点",
        tagName: "input",
        type: "text",
        name: "MemberScoreOfTokuten[1]",
        id: null,
        currentValue: "",
      },
      stolenBases: {
        formIndex: 0,
        tableIndex: -1,
        rowIndex: 1,
        cellIndex: -1,
        controlIndex: -1,
        headerText: "盗塁",
        tagName: "input",
        type: "text",
        name: "MemberScoreOfTorui[1]",
        id: null,
        currentValue: "",
      },
      errors: {
        formIndex: 0,
        tableIndex: -1,
        rowIndex: 1,
        cellIndex: -1,
        controlIndex: -1,
        headerText: "失策",
        tagName: "input",
        type: "text",
        name: "MemberScoreOfEr[1]",
        id: null,
        currentValue: "",
      },
    },
    appearanceFields: [
      {
        appearanceIndex: 1,
        main: {
          formIndex: 0,
          tableIndex: -1,
          rowIndex: 1,
          cellIndex: -1,
          controlIndex: -1,
          headerText: "1",
          tagName: "select",
          type: "select-one",
          name: "MemberScoreOf1[1]",
          id: null,
          currentValue: "0",
          currentLabel: "-",
        },
        sub: null,
        rbi: {
          formIndex: 0,
          tableIndex: -1,
          rowIndex: 1,
          cellIndex: -1,
          controlIndex: -1,
          headerText: "1_daten",
          tagName: "select",
          type: "select-one",
          name: "MemberScoreOf1_daten[1]",
          id: null,
          currentValue: "0",
          currentLabel: "0",
        },
        rbiSub: null,
      },
      {
        appearanceIndex: 2,
        main: {
          formIndex: 0,
          tableIndex: -1,
          rowIndex: 1,
          cellIndex: -1,
          controlIndex: -1,
          headerText: "2",
          tagName: "select",
          type: "select-one",
          name: "MemberScoreOf2[1]",
          id: null,
          currentValue: "0",
          currentLabel: "-",
        },
        sub: null,
        rbi: {
          formIndex: 0,
          tableIndex: -1,
          rowIndex: 1,
          cellIndex: -1,
          controlIndex: -1,
          headerText: "2_daten",
          tagName: "select",
          type: "select-one",
          name: "MemberScoreOf2_daten[1]",
          id: null,
          currentValue: "0",
          currentLabel: "0",
        },
        rbiSub: null,
      },
    ],
    extraControls: [],
    ...overrides,
  };
}

function createTargetPreview(playerRows: TargetPlayerRow[]): TargetFormPreview {
  return {
    pageUrl: "https://example.com",
    pageTitle: "Target",
    selectedFormIndex: 0,
    selectedTableIndex: 0,
    action: "/save",
    method: "post",
    availableForms: [],
    headers: [],
    hiddenInputs: [],
    eventOptions: [
      { value: "0", label: "-" },
      { value: "14", label: "三振" },
      { value: "15", label: "空三振" },
      { value: "32", label: "中安" },
      { value: "49", label: "ニゴ" },
    ],
    playerRows,
  };
}

describe("buildMappingPreview", () => {
  it("matches normalized player names and stays commit-ready", () => {
    const source: BatterStat[] = [
      {
        playerName: "山田太郎",
        battingOrder: 1,
        position: "遊",
        plateAppearances: 2,
        atBats: 4,
        runs: 1,
        hits: 2,
        rbi: 1,
        doubles: 0,
        triples: 0,
        homeRuns: 0,
        walks: 0,
        hitByPitch: 0,
        strikeouts: 1,
        sacrificeBunts: 0,
        sacrificeFlies: 0,
        stolenBases: 1,
        errors: 0,
        plateAppearanceResults: [
          {
            appearanceIndex: 1,
            rawText: "中安打",
            normalizedText: "中安打",
          },
          {
            appearanceIndex: 2,
            rawText: "二ゴロ",
            normalizedText: "二ゴロ",
          },
        ],
      },
    ];

    const preview = buildMappingPreview(source, createTargetPreview([createTargetRow()]));
    expect(preview.assignments[0].targetPlayerLabel).toBe("[10]山田太郎");
    expect(preview.assignments[0].appearanceAssignments).toHaveLength(2);
    expect(preview.assignments[0].appearanceAssignments[0].targetOptionLabel).toBe("中安");
    expect(preview.assignments[0].appearanceAssignments[1].targetOptionLabel).toBe("ニゴ");
    expect(isCommitReady(preview)).toBe(true);
  });

  it("keeps a compatible existing target value and allows missing source runs/errors", () => {
    const source: BatterStat[] = [
      {
        playerName: "山田太郎",
        battingOrder: 1,
        position: "遊",
        plateAppearances: 2,
        atBats: 3,
        runs: null,
        hits: 1,
        rbi: 0,
        doubles: 0,
        triples: 0,
        homeRuns: 0,
        walks: 0,
        hitByPitch: 0,
        strikeouts: 1,
        sacrificeBunts: 0,
        sacrificeFlies: 0,
        stolenBases: 0,
        errors: null,
        plateAppearanceResults: [
          {
            appearanceIndex: 1,
            rawText: "空振三振",
            normalizedText: "空振三振",
          },
          {
            appearanceIndex: 2,
            rawText: "中安打",
            normalizedText: "中安打",
          },
        ],
      },
    ];

    const targetRow = createTargetRow({
      statFields: {
        ...createTargetRow().statFields,
        rbi: {
          ...createTargetRow().statFields.rbi,
          currentValue: "0",
        },
        stolenBases: {
          ...createTargetRow().statFields.stolenBases,
          currentValue: "0",
        },
      },
      appearanceFields: [
        {
          appearanceIndex: 1,
          main: {
            formIndex: 0,
            tableIndex: -1,
            rowIndex: 1,
            cellIndex: -1,
            controlIndex: -1,
            headerText: "1",
            tagName: "select",
            type: "select-one",
            name: "MemberScoreOf1[1]",
            id: null,
            currentValue: "14",
            currentLabel: "三振",
          },
          sub: null,
          rbi: {
            formIndex: 0,
            tableIndex: -1,
            rowIndex: 1,
            cellIndex: -1,
            controlIndex: -1,
            headerText: "1_daten",
            tagName: "select",
            type: "select-one",
            name: "MemberScoreOf1_daten[1]",
            id: null,
            currentValue: "0",
            currentLabel: "0",
          },
          rbiSub: null,
        },
        {
          appearanceIndex: 2,
          main: {
            formIndex: 0,
            tableIndex: -1,
            rowIndex: 1,
            cellIndex: -1,
            controlIndex: -1,
            headerText: "2",
            tagName: "select",
            type: "select-one",
            name: "MemberScoreOf2[1]",
            id: null,
            currentValue: "0",
            currentLabel: "-",
          },
          sub: null,
          rbi: {
            formIndex: 0,
            tableIndex: -1,
            rowIndex: 1,
            cellIndex: -1,
            controlIndex: -1,
            headerText: "2_daten",
            tagName: "select",
            type: "select-one",
            name: "MemberScoreOf2_daten[1]",
            id: null,
            currentValue: "0",
            currentLabel: "0",
          },
          rbiSub: null,
        },
      ],
    });

    const preview = buildMappingPreview(source, createTargetPreview([targetRow]));
    expect(preview.assignments[0].appearanceAssignments[0].targetOptionLabel).toBe("三振");
    expect(isCommitReady(preview)).toBe(true);
  });
});

describe("verifyAppliedMapping", () => {
  it("confirms the reloaded target preview after save", () => {
    const source: BatterStat[] = [
      {
        playerName: "山田太郎",
        battingOrder: 1,
        position: "遊",
        plateAppearances: 2,
        atBats: 4,
        runs: 1,
        hits: 2,
        rbi: 1,
        doubles: 0,
        triples: 0,
        homeRuns: 0,
        walks: 0,
        hitByPitch: 0,
        strikeouts: 1,
        sacrificeBunts: 0,
        sacrificeFlies: 0,
        stolenBases: 1,
        errors: 0,
        plateAppearanceResults: [
          {
            appearanceIndex: 1,
            rawText: "中安打",
            normalizedText: "中安打",
          },
          {
            appearanceIndex: 2,
            rawText: "二ゴロ",
            normalizedText: "二ゴロ",
          },
        ],
      },
    ];

    const mapping = buildMappingPreview(source, createTargetPreview([createTargetRow()]));
    const verifiedPreview = createTargetPreview([
      createTargetRow({
        statFields: {
          ...createTargetRow().statFields,
          rbi: {
            ...createTargetRow().statFields.rbi,
            currentValue: "1",
          },
          runs: {
            ...createTargetRow().statFields.runs,
            currentValue: "1",
          },
          stolenBases: {
            ...createTargetRow().statFields.stolenBases,
            currentValue: "1",
          },
          errors: {
            ...createTargetRow().statFields.errors,
            currentValue: "0",
          },
        },
        appearanceFields: [
          {
            ...createTargetRow().appearanceFields[0],
            main: {
              ...createTargetRow().appearanceFields[0].main,
              currentValue: "32",
              currentLabel: "中安",
            },
          },
          {
            ...createTargetRow().appearanceFields[1],
            main: {
              ...createTargetRow().appearanceFields[1].main,
              currentValue: "49",
              currentLabel: "ニゴ",
            },
          },
        ],
      }),
    ]);

    expect(verifyAppliedMapping(mapping, verifiedPreview)).toEqual({
      verified: true,
      issues: [],
    });
  });
});
