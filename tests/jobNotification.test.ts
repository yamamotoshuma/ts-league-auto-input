import { describe, expect, it } from "vitest";
import {
  buildJobFailedMessage,
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

function addBatterPublicGamePreview(job: JobRecord): JobRecord {
  return {
    ...job,
    preview: {
      workflow: "batter",
      source: null,
      target: {
        hiddenInputs: [
          { name: "Id", value: "14879" },
          { name: "MemberScoreOfGameYear", value: "2026" },
        ],
      },
      mapping: null,
      pitcher: null,
      parkLottery: null,
      warnings: [],
      commitReady: true,
    } as JobRecord["preview"],
  };
}

function addPitcherPublicGamePreview(job: JobRecord): JobRecord {
  return {
    ...job,
    preview: {
      workflow: "pitcher",
      source: null,
      target: null,
      mapping: null,
      pitcher: {
        allocations: [],
        source: {
          sourceUrl: "https://ts-league.com/game/2026/index.php?gameid=14879",
        },
        target: null,
        mapping: null,
      },
      parkLottery: null,
      warnings: [],
      commitReady: true,
    } as JobRecord["preview"],
  };
}

describe("jobNotification", () => {
  it("builds a compact success message with result summary", () => {
    const job = addBatterPublicGamePreview(createJobRecord());
    const message = buildJobSucceededMessage(job, {
      message: "ok",
      sourcePlayerCount: 9,
      matchedPlayers: 9,
      unmappedPlayers: 0,
      saveAttempted: true,
      saved: true,
      targetGameUrl: "https://example.com",
    });

    expect(message).toContain("【TS-League自動反映】完了");
    expect(message).toContain("処理: 野手成績 / 保存実行");
    expect(message).toContain("対象: 2026/3/7 / Re / 光が丘公園");
    expect(message).toContain("結果: 対応 9 / 取得 9");
    expect(message).toContain("保存確認: 済み");
    expect(message).not.toContain("ジョブID");
    expect(message).not.toContain("編集シーズン");
    expect(message).toContain("⚠️重要な情報⚠️");
    expect(message).toContain("野手成績はシステムによる自動反映です。");
    expect(message).toContain("**必ず各選手が自分の成績を目視で確認**");
    expect(message).toContain("成績の誤りは各自の責任です。");
    expect(message).toContain("試合詳細: https://ts-league.com/game/2026/index.php?gameid=14879");
    expect(message).not.toContain("山本");
  });

  it("adds an important manual verification notice to pitcher success messages", () => {
    const job = addPitcherPublicGamePreview({
      ...createJobRecord(),
      workflow: "pitcher" as const,
    });
    const message = buildJobSucceededMessage(job, {
      message: "ok",
      sourcePlayerCount: 2,
      matchedPlayers: 2,
      unmappedPlayers: 0,
      saveAttempted: true,
      saved: true,
      targetGameUrl: "https://example.com",
    });

    expect(message).toContain("処理: 投手成績 / 保存実行");
    expect(message).toContain("⚠️重要な情報⚠️");
    expect(message).toContain("投手成績はシステムによる自動反映で、失点・自責点・勝敗などには概算を含みます。");
    expect(message).toContain("**必ず登板した選手が自分の投手成績を目視で確認**");
    expect(message).toContain("成績の誤りは各自の責任です。");
    expect(message).toContain("試合詳細: https://ts-league.com/game/2026/index.php?gameid=14879");
    expect(message).not.toContain("山本");
  });

  it("builds a compact error message with step and content", () => {
    const job = addBatterPublicGamePreview(createJobRecord());
    const message = buildJobFailedMessage(job, {
      message: "保存に失敗しました",
      step: "target.submit-form",
      url: "https://example.com",
      candidateCauses: [],
    });

    expect(message).toContain("【TS-League自動反映】エラー");
    expect(message).toContain("工程: 保存を実行");
    expect(message).toContain("内容: 保存に失敗しました");
    expect(message).toContain("⚠️重要な情報⚠️");
    expect(message).toContain("成績の誤りは各自の責任です。");
    expect(message).toContain("試合詳細: https://ts-league.com/game/2026/index.php?gameid=14879");
    expect(message).not.toContain("ジョブID");
  });

  it("adds an important manual verification notice to pitcher error messages", () => {
    const job = addPitcherPublicGamePreview({
      ...createJobRecord(),
      workflow: "pitcher" as const,
    });
    const message = buildJobFailedMessage(job, {
      message: "保存に失敗しました",
      step: "target.submit-form",
      url: "https://example.com",
      candidateCauses: [],
    });

    expect(message).toContain("処理: 投手成績 / 保存実行");
    expect(message).toContain("⚠️重要な情報⚠️");
    expect(message).toContain("成績の誤りは各自の責任です。");
    expect(message).toContain("試合詳細: https://ts-league.com/game/2026/index.php?gameid=14879");
    expect(message).not.toContain("山本");
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

    expect(message).toContain("【TS-League自動反映】完了");
    expect(message).toContain("処理: 都立公園抽選 / 保存実行");
    expect(message).toContain("結果: 成功 1 / 総数 2");
    expect(message).toContain("失敗: 1");
    expect(message).toContain("1004156 / 浮間公園 / 野球場 / 5月1日(金曜)2026年 / 09時00分～11時00分 / 1枠目");
    expect(message).toContain("ログイン状態を維持できませんでした");
    expect(message).not.toContain("10088063 / 浮間公園");
  });
});
