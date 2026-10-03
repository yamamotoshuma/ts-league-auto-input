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
  "notify.discord": "Discord通知",
};

const BATTER_VERIFICATION_NOTICE_LINES = [
  "⚠️重要な情報⚠️",
  "野手成績はシステムによる自動反映です。システムが確認するのは「自動反映が完了したこと」までで、各成績の正確性は保証しません。",
  "**必ず各選手が自分の成績を目視で確認**し、誤りがあれば速やかに申告の上、**各自で修正**してください。",
  "成績の誤りは各自の責任です。再三のお願いとなりますが、必ず各自で確認してください。",
];

const PITCHER_ESTIMATION_NOTICE_LINES = [
  "⚠️重要な情報⚠️",
  "投手成績はシステムによる自動反映で、失点・自責点・勝敗などには概算を含みます。システムが確認するのは「自動反映が完了したこと」までで、各成績の正確性は保証しません。",
  "**必ず登板した選手が自分の投手成績を目視で確認**し、誤りがあれば速やかに申告の上、**各自で修正**してください。",
  "成績の誤りは各自の責任です。再三のお願いとなりますが、必ず各自で確認してください。",
];

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

function workflowLabel(job: JobRecord): string {
  const workflow = job.workflow ?? "batter";
  return workflow === "pitcher" ? "投手成績" : workflow === "park-lottery" ? "都立公園抽選" : "野手成績";
}

function buildImportantNoticeLines(job: JobRecord): string[] {
  return job.workflow === "pitcher"
    ? PITCHER_ESTIMATION_NOTICE_LINES
    : (job.workflow ?? "batter") === "batter"
      ? BATTER_VERIFICATION_NOTICE_LINES
      : [];
}

function findHiddenInputValue(
  inputs: Array<{ name: string | null; value: string | null }> | undefined,
  names: string[],
): string | null {
  if (!inputs) {
    return null;
  }

  for (const name of names) {
    const value = inputs.find((input) => input.name === name)?.value?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function resolvePublicGameUrl(job: JobRecord): string | null {
  const pitcherSourceUrl = job.preview?.pitcher?.source?.sourceUrl ?? null;
  if (pitcherSourceUrl && /\/game\/\d{4}\/index\.php\?[^#]*gameid=\d+/.test(pitcherSourceUrl)) {
    return pitcherSourceUrl;
  }

  const hiddenInputs = job.preview?.target?.hiddenInputs ?? job.preview?.pitcher?.target?.hiddenInputs;
  const gameId = findHiddenInputValue(hiddenInputs, ["Id"]);
  const gameYear =
    findHiddenInputValue(hiddenInputs, [
      "MemberScoreOfGameYear",
      "MemberScoreOfGameYear2",
      "MemberScoreDfGameYear",
      "MemberScoreDfGameYear2",
    ]) ?? job.targetGameSeasonYear;

  if (!gameId || !gameYear || !/^\d+$/.test(gameId) || !/^\d{4}$/.test(gameYear)) {
    return null;
  }

  return `https://ts-league.com/game/${gameYear}/index.php?gameid=${gameId}`;
}

function buildGameDetailLines(job: JobRecord): string[] {
  const publicGameUrl = resolvePublicGameUrl(job);
  return publicGameUrl ? [`試合詳細: ${publicGameUrl}`] : [];
}

function buildSummaryLines(job: JobRecord): string[] {
  const workflow = job.workflow ?? "batter";
  const target =
    workflow === "park-lottery"
      ? job.targetGameKey
      : [formatDate(job.targetGameDate), job.targetOpponent, job.targetVenue].filter(Boolean).join(" / ");

  return [
    `処理: ${workflowLabel(job)} / ${modeLabel(job.mode)}`,
    `対象: ${target || job.targetGameKey}`,
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

function limitDetails(details: string[], max = 3): string[] {
  if (details.length <= max) {
    return details;
  }

  return [...details.slice(0, max), `ほか${details.length - max}件`];
}

export function buildJobSucceededMessage(job: JobRecord, resultSummary: JobResultSummary | null): string {
  if (job.workflow === "park-lottery") {
    const parkSummary = buildParkLotterySummary(job);
    return [
      "【TS-League自動反映】完了",
      ...buildSummaryLines(job),
      `結果: 成功 ${parkSummary?.success ?? "-"} / 総数 ${parkSummary?.total ?? "-"}`,
      ...(parkSummary?.failed ? [`失敗: ${parkSummary.failed}`] : []),
      ...(parkSummary && parkSummary.details.length > 0 ? ["失敗詳細:", ...limitDetails(parkSummary.details)] : []),
    ].join("\n");
  }

  return [
    "【TS-League自動反映】完了",
    ...buildSummaryLines(job),
    ...buildImportantNoticeLines(job),
    ...buildGameDetailLines(job),
    `結果: 対応 ${resultSummary?.matchedPlayers ?? "-"} / 取得 ${resultSummary?.sourcePlayerCount ?? "-"}`,
    `未対応: ${resultSummary?.unmappedPlayers ?? "-"}`,
    `保存確認: ${resultSummary?.saved ? "済み" : "なし"}`,
  ].join("\n");
}

export function buildJobFailedMessage(job: JobRecord, errorSummary: JobErrorSummary | null): string {
  if (job.workflow === "park-lottery") {
    const parkSummary = buildParkLotterySummary(job);
    return [
      "【TS-League自動反映】エラー",
      ...buildSummaryLines(job),
      `工程: ${stepLabel(errorSummary?.step)}`,
      `内容: ${errorSummary?.message ?? "不明"}`,
      ...(parkSummary
        ? [`結果: 成功 ${parkSummary.success} / 総数 ${parkSummary.total}`, `失敗: ${parkSummary.failed}`]
        : []),
      ...(parkSummary && parkSummary.details.length > 0 ? ["失敗詳細:", ...limitDetails(parkSummary.details)] : []),
    ].join("\n");
  }

  return [
    "【TS-League自動反映】エラー",
    ...buildSummaryLines(job),
    ...buildImportantNoticeLines(job),
    ...buildGameDetailLines(job),
    `工程: ${stepLabel(errorSummary?.step)}`,
    `内容: ${errorSummary?.message ?? "不明"}`,
  ].join("\n");
}
