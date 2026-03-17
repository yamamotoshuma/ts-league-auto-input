import { describe, expect, it } from "vitest";
import { normalizeName } from "../src/utils/nameNormalizer";

describe("normalizeName", () => {
  it("normalizes width and spaces", () => {
    expect(normalizeName(" 山田　太郎 ")).toBe("山田太郎");
  });

  it("removes dots and lowers case", () => {
    expect(normalizeName("A・B")).toBe("ab");
  });
});

