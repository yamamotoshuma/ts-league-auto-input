import { describe, expect, it } from "vitest";
import {
  buildJobFailedMessage,
  buildJobStartedMessage,
  buildJobSucceededMessage,
} from "../src/domain/jobNotification";
import type { JobRecord } from "../src/domain/types";

function createJobRecord(): JobRecord {
  return {
    workflow: "batter",
    id: "job-123",
    dedupeKey: "dedupe",
    status: "running",
    createdAt: "2026-03-17T11:00:00.000Z",
    startedAt: "2026-03-17T11:00:10.000Z",
    finishedAt: null,
    logs: [],
    resultSummary: null,
    errorSummary: null,
    preview: null,
    lastStep: "job.started",
    artifactPaths: [],
    retryOf: null,
    sourceGameId: "37",
    sourceUrl: null,
    targetGameKey: "3/7 9:00 光が丘公園 Re",
    targetGameDate: "2026-03-07",
    targetOpponent: "Re",
    targetVenue: "光が丘公園",
    mode: "commit",
  };
}

describe("jobNotification", () => {
  it("builds a started message with match date and opponent", () => {
    const message = buildJobStartedMessage(createJobRecord());
    expect(message).toContain("ジョブを開始しました");
    expect(message).toContain("試合日: 2026/3/7");
    expect(message).toContain("対戦相手: Re");
  });

  it("builds a success message with result summary", () => {
    const job = createJobRecord();
    const message = buildJobSucceededMessage(job, {
      message: "ok",
      sourcePlayerCount: 9,
      matchedPlayers: 9,
      unmappedPlayers: 0,
      saveAttempted: true,
      saved: true,
      targetGameUrl: "https://example.com",
    });

    expect(message).toContain("ジョブが完了しました");
    expect(message).toContain("対応できた人数: 9");
    expect(message).toContain("保存結果の確認: 済み");
  });

  it("builds an error message with step and content", () => {
    const job = createJobRecord();
    const message = buildJobFailedMessage(job, {
      message: "保存に失敗しました",
      step: "target.submit-form",
      url: "https://example.com",
      candidateCauses: [],
    });

    expect(message).toContain("ジョブでエラーが発生しました");
    expect(message).toContain("発生工程: 保存を実行");
    expect(message).toContain("内容: 保存に失敗しました");
  });

  it("builds a park lottery success message with failure details only for failed entries", () => {
    const job = {
      ...createJobRecord(),
      workflow: "park-lottery" as const,
      targetGameKey: "野球 / 浮間公園 / 野球場 / 2026-05-01 / 09:00-11:00",
      targetGameDate: null,
      targetOpponent: null,
      targetVenue: null,
      parkAccountSelector: "10088063,1004156",
      parkEntriesText: "[]",
      preview: {
        workflow: "park-lottery" as const,
        source: null,
        target: null,
        mapping: null,
        pitcher: null,
        warnings: [],
        commitReady: false,
        parkLottery: {
          requestedAccountSelector: "10088063,1004156",
          requestedEntries: [],
          accountPreviews: [
            {
              accountLabel: "10088063",
              userId: "10088063",
              status: "ready" as const,
              warnings: [],
              entryPreviews: [
                {
                  entryIndex: 1,
                  status: "ready" as const,
                  pageUrl: null,
                  pageTitle: null,
                  selectedSportLabel: "野球",
                  selectedParkName: "浮間公園",
                  selectedFacilityName: "野球場",
                  selectedDateLabel: "5月1日(金曜)2026年",
                  selectedTimeLabel: "09時00分～11時00分",
                  requestedApplyNumber: "1",
                  requestedApplyOptionValue: "1-1",
                  availableApplyOptions: [],
                  warnings: [],
                },
              ],
            },
            {
              accountLabel: "1004156",
              userId: "1004156",
              status: "failed" as const,
              warnings: ["ログイン状態を維持できませんでした"],
              entryPreviews: [
                {
                  entryIndex: 1,
                  status: "failed" as const,
                  pageUrl: null,
                  pageTitle: null,
                  selectedSportLabel: "野球",
                  selectedParkName: "浮間公園",
                  selectedFacilityName: "野球場",
                  selectedDateLabel: "5月1日(金曜)2026年",
                  selectedTimeLabel: "09時00分～11時00分",
                  requestedApplyNumber: "1",
                  requestedApplyOptionValue: null,
                  availableApplyOptions: [],
                  warnings: ["ログイン状態を維持できませんでした"],
                },
              ],
            },
          ],
        },
      },
    } satisfies JobRecord;

    const message = buildJobSucceededMessage(job, {
      message: "partial",
      sourcePlayerCount: 2,
      matchedPlayers: 1,
      unmappedPlayers: 1,
      saveAttempted: true,
      saved: false,
      targetGameUrl: "https://example.com",
    });

    expect(message).toContain("都立公園抽選が完了しました");
    expect(message).toContain("総数: 2");
    expect(message).toContain("成功件数: 1");
    expect(message).toContain("失敗件数: 1");
    expect(message).toContain("1004156 / 浮間公園 / 野球場 / 5月1日(金曜)2026年 / 09時00分～11時00分 / 1枠目");
    expect(message).toContain("ログイン状態を維持できませんでした");
    expect(message).not.toContain("10088063 / 浮間公園");
  });
});
