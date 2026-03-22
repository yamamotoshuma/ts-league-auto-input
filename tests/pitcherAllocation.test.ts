import { describe, expect, it } from "vitest";
import { parsePitcherAllocationText } from "../src/domain/pitcherAllocation";

describe("parsePitcherAllocationText", () => {
  it("parses whole-inning pitcher allocations", () => {
    expect(parsePitcherAllocationText("安楽 3回\n藤田 3回")).toEqual([
      {
        order: 1,
        rawText: "安楽 3回",
        pitcherName: "安楽",
        innings: 3,
        outs: 0,
      },
      {
        order: 2,
        rawText: "藤田 3回",
        pitcherName: "藤田",
        innings: 3,
        outs: 0,
      },
    ]);
  });

  it("parses fractional notation and reports line numbers on error", () => {
    expect(parsePitcherAllocationText("安楽 3.1\n藤田 0回2/3")[0]).toMatchObject({
      innings: 3,
      outs: 1,
    });

    expect(() => parsePitcherAllocationText("安楽\n藤田 3回")).toThrow(/1行目/);
  });
});
