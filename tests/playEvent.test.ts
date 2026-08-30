import { describe, expect, it } from "vitest";
import { findTargetEventOption, getTargetEventLabelCandidates } from "../src/domain/playEvent";

describe("play event mapping", () => {
  const doublePlayOptions = [
    { value: "21", label: "併殺" },
    { value: "114", label: "投併" },
    { value: "116", label: "一併" },
    { value: "119", label: "遊併" },
  ];

  it("maps a position-specific double play to the matching target option", () => {
    expect(getTargetEventLabelCandidates("一併殺")).toEqual(["一併", "併殺"]);
    expect(findTargetEventOption("一併殺", doublePlayOptions)).toEqual({ value: "116", label: "一併" });
  });

  it("falls back to the generic double-play option", () => {
    expect(findTargetEventOption("中ゲッツー", doublePlayOptions)).toEqual({ value: "21", label: "併殺" });
  });
});
