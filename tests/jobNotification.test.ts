import { describe, expect, it } from "vitest";
import {
  buildJobFailedMessage,
  buildJobStartedMessage,
  buildJobSucceededMessage,
} from "../src/domain/jobNotification";
import type { JobRecord } from "../src/domain/types";

function createJobRecord(): JobRecord {
  return {
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
});
