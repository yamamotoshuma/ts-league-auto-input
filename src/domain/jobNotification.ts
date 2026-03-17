import type { JobErrorSummary, JobRecord, JobResultSummary, RunMode } from "./types";

const STEP_LABELS: Record<string, string> = {
  "job.queued": "受付",
  "job.started": "実行開始",
  "job.succeeded": "正常終了",
  "job.failed": "失敗",
  "source.open": "取込元のページを開く",
  "target.open-list": "反映先の一覧を開く",
  "target.game-selected": "反映先の試合を特定",
  "target.inspect-form": "反映先フォームを確認",
  "target.fill-form": "反映先フォームへ入力",
  "target.submit-form": "保存を実行",
  "target.submit-verified": "完了画面を確認",
  "target.verify-saved": "保存結果を再確認",
  "notify.line": "LINE通知",
};

function formatDate(value: string | null): string {
  if (!value) {
    return "未指定";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("ja-JP");
}

function modeLabel(mode: RunMode): string {
  return mode === "commit" ? "保存実行" : "確認実行";
}

function stepLabel(value: string | null | undefined): string {
  if (!value) {
    return "不明";
  }

  return STEP_LABELS[value] ?? value;
}

function buildBaseLines(job: JobRecord): string[] {
  return [
    `実行方法: ${modeLabel(job.mode)}`,
    `試合日: ${formatDate(job.targetGameDate)}`,
    `対戦相手: ${job.targetOpponent ?? "未指定"}`,
    `球場: ${job.targetVenue ?? "未指定"}`,
    `対象試合: ${job.targetGameKey}`,
    `ジョブID: ${job.id}`,
  ];
}

export function buildJobStartedMessage(job: JobRecord): string {
  return [
    "【スカイツリーグ野手成績自動反映】",
    "ジョブを開始しました",
    ...buildBaseLines(job),
  ].join("\n");
}

export function buildJobSucceededMessage(job: JobRecord, resultSummary: JobResultSummary | null): string {
  return [
    "【スカイツリーグ野手成績自動反映】",
    "ジョブが完了しました",
    ...buildBaseLines(job),
    `取得した選手数: ${resultSummary?.sourcePlayerCount ?? "-"}`,
    `対応できた人数: ${resultSummary?.matchedPlayers ?? "-"}`,
    `対応できなかった人数: ${resultSummary?.unmappedPlayers ?? "-"}`,
    `保存結果の確認: ${resultSummary?.saved ? "済み" : "なし"}`,
  ].join("\n");
}

export function buildJobFailedMessage(job: JobRecord, errorSummary: JobErrorSummary | null): string {
  return [
    "【スカイツリーグ野手成績自動反映】",
    "ジョブでエラーが発生しました",
    ...buildBaseLines(job),
    `発生工程: ${stepLabel(errorSummary?.step)}`,
    `内容: ${errorSummary?.message ?? "不明"}`,
  ].join("\n");
}
