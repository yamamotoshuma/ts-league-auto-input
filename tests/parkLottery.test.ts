import { describe, expect, it } from "vitest";
import {
  buildApplyHopeValue,
  buildParkLotteryTargetLabel,
  getParkSportLabel,
  normalizeParkTimeValue,
  normalizeParkUseDate,
  parseParkEntriesText,
  parseParkAccountSelector,
  selectTokyoParkAccounts,
} from "../src/domain/parkLottery";
import type { JobInput, TokyoParkAccountSecrets } from "../src/domain/types";

describe("parkLottery helpers", () => {
  it("normalizes date and time values", () => {
    expect(normalizeParkUseDate("2026-05-01")).toBe("20260501");
    expect(normalizeParkUseDate("20260501")).toBe("20260501");
    expect(normalizeParkUseDate("2026/5/1")).toBeNull();

    expect(normalizeParkTimeValue("09:00")).toBe("0900");
    expect(normalizeParkTimeValue("900")).toBe("0900");
    expect(normalizeParkTimeValue("11:00")).toBe("1100");
    expect(normalizeParkTimeValue("9")).toBeNull();
  });

  it("selects enabled accounts from labels and user ids", () => {
    const accounts: TokyoParkAccountSecrets[] = [
      { label: "主力", userId: "1001", password: "x", enabled: true },
      { label: "控え", userId: "1002", password: "x", enabled: true },
      { label: "停止中", userId: "1003", password: "x", enabled: false },
    ];

    expect(selectTokyoParkAccounts(accounts, null).map((account) => account.userId)).toEqual(["1001", "1002"]);
    expect(selectTokyoParkAccounts(accounts, "主力,1002").map((account) => account.userId)).toEqual(["1001", "1002"]);
    expect(selectTokyoParkAccounts(accounts, "1003")).toEqual([]);
  });

  it("builds apply number values and target labels", () => {
    expect(buildApplyHopeValue("1")).toBe("1-1");
    expect(buildApplyHopeValue("2")).toBe("2-1");
    expect(buildApplyHopeValue("3")).toBeNull();
    expect(getParkSportLabel("140")).toBe("サッカー・ラグビー・ホッケー");

    const input: JobInput = {
      workflow: "park-lottery",
      sourceGameId: null,
      sourceUrl: null,
      targetGameKey: "",
      targetGameDate: null,
      targetOpponent: null,
      targetVenue: null,
      pitcherAllocationText: null,
      parkAccountSelector: null,
      parkEntriesText: JSON.stringify([
        {
          sportClassCode: "100",
          parkName: "浮間公園",
          facilityName: "野球場",
          useDate: "2026-05-01",
          startTime: "09:00",
          endTime: "11:00",
          applyNumber: "1",
        },
      ]),
      mode: "dry-run",
    };

    expect(buildParkLotteryTargetLabel(input)).toBe("野球 / 浮間公園 / 野球場 / 2026-05-01 / 09:00-11:00");
    expect(parseParkAccountSelector("主力\n控え,1003")).toEqual(["主力", "控え", "1003"]);
    expect(parseParkEntriesText(input.parkEntriesText)).toHaveLength(1);
  });
});
