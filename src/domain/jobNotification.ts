import type { JobErrorSummary, JobRecord, JobResultSummary, RunMode } from "./types";

const STEP_LABELS: Record<string, string> = {
  "job.queued": "受付",
  "job.started": "実行開始",
  "job.succeeded": "正常終了",
  "job.failed": "失敗",
  "source.open": "取込元のページを開く",
  "target.open-list": "反映先の一覧を開く",
  "target.game-selected": "反映先の試合を特定",
  "target.prepare-form": "反映先フォームを準備",
  "target.inspect-form": "反映先フォームを確認",
  "target.fill-form": "反映先フォームへ入力",
  "target.submit-form": "保存を実行",
  "target.submit-verified": "完了画面を確認",
  "target.verify-saved": "保存結果を再確認",
  "park.login": "都立公園へログイン",
  "park.entry.prepare": "抽選内容を確認",
  "park.entry.submit": "抽選申込みを送信",
  "park.logout": "ログアウト",
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
  const workflow = job.workflow ?? "batter";
  const workflowLabel =
    workflow === "pitcher" ? "投手成績" : workflow === "park-lottery" ? "都立公園抽選" : "野手成績";
  return [
    `処理種別: ${workflowLabel}`,
    `実行方法: ${modeLabel(job.mode)}`,
    workflow === "park-lottery" ? `対象内容: ${job.targetGameKey}` : `試合日: ${formatDate(job.targetGameDate)}`,
    ...(workflow === "park-lottery"
      ? []
      : [`対戦相手: ${job.targetOpponent ?? "未指定"}`, `球場: ${job.targetVenue ?? "未指定"}`]),
    `${workflow === "park-lottery" ? "対象" : "対象試合"}: ${job.targetGameKey}`,
    `ジョブID: ${job.id}`,
  ];
}

function formatParkApplySlot(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return normalized ? `${normalized}枠目` : "枠未指定";
}

function buildParkLotterySummary(job: JobRecord): { total: number; success: number; failed: number; details: string[] } | null {
  const accountPreviews = job.preview?.parkLottery?.accountPreviews;
  if (!accountPreviews) {
    return null;
  }

  const entryPreviews = accountPreviews.flatMap((accountPreview) =>
    accountPreview.entryPreviews.map((entryPreview) => ({
      account: accountPreview.userId,
      entry: entryPreview,
    })),
  );

  const total = entryPreviews.length;
  const success = entryPreviews.filter(({ entry }) => entry.status !== "failed").length;
  const failedEntries = entryPreviews.filter(({ entry }) => entry.status === "failed");
  const details = failedEntries.map(({ account, entry }) => {
    const location = [entry.selectedParkName ?? "公園未特定", entry.selectedFacilityName ?? "施設未特定"].join(" / ");
    const timing = [entry.selectedDateLabel ?? "日付未特定", entry.selectedTimeLabel ?? "時間未特定"].join(" / ");
    const warning = entry.warnings[0] ?? "詳細不明";
    return `${account} / ${location} / ${timing} / ${formatParkApplySlot(entry.requestedApplyNumber)}: ${warning}`;
  });

  return {
    total,
    success,
    failed: failedEntries.length,
    details,
  };
}

export function buildJobStartedMessage(job: JobRecord): string {
  return [
    "【スカイツリーグ成績自動反映】",
    "ジョブを開始しました",
    ...buildBaseLines(job),
  ].join("\n");
}

export function buildJobSucceededMessage(job: JobRecord, resultSummary: JobResultSummary | null): string {
  if (job.workflow === "park-lottery") {
    const parkSummary = buildParkLotterySummary(job);
    return [
      "【スカイツリーグ成績自動反映】",
      "都立公園抽選が完了しました",
      ...buildBaseLines(job),
      `総数: ${parkSummary?.total ?? "-"}`,
      `成功件数: ${parkSummary?.success ?? "-"}`,
      `失敗件数: ${parkSummary?.failed ?? "-"}`,
      ...(parkSummary && parkSummary.details.length > 0 ? ["失敗詳細:", ...parkSummary.details] : []),
    ].join("\n");
  }

  return [
    "【スカイツリーグ成績自動反映】",
    "ジョブが完了しました",
    ...buildBaseLines(job),
    `取得した選手数: ${resultSummary?.sourcePlayerCount ?? "-"}`,
    `対応できた人数: ${resultSummary?.matchedPlayers ?? "-"}`,
    `対応できなかった人数: ${resultSummary?.unmappedPlayers ?? "-"}`,
    `保存結果の確認: ${resultSummary?.saved ? "済み" : "なし"}`,
  ].join("\n");
}

export function buildJobFailedMessage(job: JobRecord, errorSummary: JobErrorSummary | null): string {
  if (job.workflow === "park-lottery") {
    const parkSummary = buildParkLotterySummary(job);
    return [
      "【スカイツリーグ成績自動反映】",
      "都立公園抽選でエラーが発生しました",
      ...buildBaseLines(job),
      `発生工程: ${stepLabel(errorSummary?.step)}`,
      `内容: ${errorSummary?.message ?? "不明"}`,
      `総数: ${parkSummary?.total ?? "-"}`,
      `成功件数: ${parkSummary?.success ?? "-"}`,
      `失敗件数: ${parkSummary?.failed ?? "-"}`,
      ...(parkSummary && parkSummary.details.length > 0 ? ["失敗詳細:", ...parkSummary.details] : []),
    ].join("\n");
  }

  return [
    "【スカイツリーグ成績自動反映】",
    "ジョブでエラーが発生しました",
    ...buildBaseLines(job),
    `発生工程: ${stepLabel(errorSummary?.step)}`,
    `内容: ${errorSummary?.message ?? "不明"}`,
  ].join("\n");
}
