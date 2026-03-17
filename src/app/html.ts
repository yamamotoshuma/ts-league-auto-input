import type { JobRecord, JobStatus, RunMode } from "../domain/types";

export function escapeHtml(value: unknown): string {
  const text = String(value ?? "");
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "未実行";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function statusLabel(status: JobStatus): string {
  switch (status) {
    case "queued":
      return "受付中";
    case "running":
      return "実行中";
    case "succeeded":
      return "成功";
    case "failed":
      return "失敗";
    case "cancelled":
      return "停止";
    default:
      return status;
  }
}

function modeLabel(mode: RunMode): string {
  return mode === "commit" ? "保存実行" : "確認実行";
}

function renderRecentJobs(jobs: JobRecord[]): string {
  if (jobs.length === 0) {
    return '<p class="empty-state">まだ実行履歴はありません。上のフォームから確認実行を行ってください。</p>';
  }

  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>受付日時</th>
            <th>状態</th>
            <th>実行方法</th>
            <th>取込元</th>
            <th>反映先試合</th>
            <th>詳細</th>
          </tr>
        </thead>
        <tbody>
          ${jobs
            .map(
              (job) => `
                <tr>
                  <td data-label="受付日時">${escapeHtml(formatDateTime(job.createdAt))}</td>
                  <td data-label="状態"><span class="status-chip status-${escapeHtml(job.status)}">${escapeHtml(statusLabel(job.status))}</span></td>
                  <td data-label="実行方法"><span class="mode-chip mode-${escapeHtml(job.mode)}">${escapeHtml(modeLabel(job.mode))}</span></td>
                  <td data-label="取込元">${escapeHtml(job.sourceUrl ?? job.sourceGameId ?? "-")}</td>
                  <td data-label="反映先試合">${escapeHtml(job.targetGameKey)}</td>
                  <td data-label="詳細"><a class="text-link" href="/jobs/${encodeURIComponent(job.id)}">詳細を見る</a></td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderLayout(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/styles/app.css">
  </head>
  <body>
    <main class="shell">
      <header class="header-panel">
        <div class="header-copy">
          <p class="eyebrow">ORDER MADE → スカイツリーグ</p>
          <h1>野手成績自動反映ツール</h1>
          <p class="header-lead">Order Made の試合ページから野手成績だけを取得し、スカイツリーグ管理画面へ反映します。</p>
        </div>
        <div class="header-actions">
          <p class="header-note">まず確認実行、その後に保存実行。保存後は再読込して確認します。</p>
          <nav class="header-nav">
            <a href="/">トップ</a>
          </nav>
        </div>
      </header>
      ${body}
    </main>
    <script src="/app.js" defer></script>
  </body>
</html>`;
}

export function renderIndexPage(jobs: JobRecord[]): string {
  return renderLayout(
    "トップ",
    `
      <section class="hero-board">
        <div>
          <p class="eyebrow">ブラウザ操作のみ</p>
          <h2>試合ページを読み取り、スカイツリーグへ反映します</h2>
          <p>まずは確認実行で抽出結果と入力予定値を確かめ、問題がなければ保存実行に進みます。失敗時はスクリーンショット、HTML、ログを残します。</p>
        </div>
        <div class="hero-stats">
          <div class="hero-stat">
            <span>通常操作</span>
            <strong>ブラウザだけで完結</strong>
          </div>
          <div class="hero-stat">
            <span>実行の流れ</span>
            <strong>先に確認実行</strong>
          </div>
          <div class="hero-stat">
            <span>保存後</span>
            <strong>再読込して確認</strong>
          </div>
        </div>
      </section>

      <div class="page-grid">
        <section class="panel panel-main">
          <div class="section-head">
            <div>
              <h2>試合を取り込む</h2>
              <p>対象試合を特定できる情報を入力して開始します。最初は確認実行をおすすめします。</p>
            </div>
          </div>
          <form id="job-form" class="job-form">
            <label class="field">
              <span class="field-label">ソース試合 ID</span>
              <input name="sourceGameId" placeholder="例: 37">
              <small>Order Made 側の試合 ID です。URL を入れる場合は空でも構いません。</small>
            </label>
            <label class="field field-wide">
              <span class="field-label">ソース試合 URL</span>
              <input name="sourceUrl" placeholder="例: https://ordermade.sakura.ne.jp/kanri/game/37">
              <small>ID が分からない場合はこちらを入力します。</small>
            </label>
            <label class="field field-wide">
              <span class="field-label">対象試合の識別キーワード</span>
              <input name="targetGameKey" required placeholder="例: 3/7 9:00 光が丘公園 Re">
              <small>試合一覧の行テキストに含まれる日付、球場、相手名をまとめて入れると安定します。</small>
            </label>
            <label class="field">
              <span class="field-label">対象日</span>
              <input name="targetGameDate" type="date" placeholder="2026-03-07">
              <small>任意ですが、同日の複数試合がある場合に有効です。</small>
            </label>
            <label class="field">
              <span class="field-label">対戦相手</span>
              <input name="targetOpponent" placeholder="例: Re">
              <small>試合一覧の相手名表記に合わせてください。</small>
            </label>
            <label class="field">
              <span class="field-label">球場</span>
              <input name="targetVenue" placeholder="例: 光が丘公園">
              <small>球場名まで入れると誤マッチを避けやすくなります。</small>
            </label>
            <fieldset class="mode-switch">
              <legend>実行方法</legend>
              <label class="mode-option">
                <input type="radio" name="mode" value="dry-run" checked>
                <span>
                  <strong>確認実行</strong>
                  <small>保存せず、抽出結果と入力予定値だけを確認します。</small>
                </span>
              </label>
              <label class="mode-option">
                <input type="radio" name="mode" value="commit">
                <span>
                  <strong>保存実行</strong>
                  <small>スカイツリーグに保存し、その後で反映結果を再確認します。</small>
                </span>
              </label>
            </fieldset>
            <div class="form-footer">
              <div id="mode-notice" class="notice notice-info">確認実行では保存しません。</div>
              <div class="actions">
                <button id="job-submit-button" type="submit">取り込みを開始</button>
                <span id="job-form-error" class="error-text" role="alert"></span>
              </div>
            </div>
          </form>
        </section>

        <aside class="panel panel-side">
          <div class="section-head">
            <div>
              <h2>注意事項</h2>
              <p>保存実行を安全に行うための前提です。</p>
            </div>
          </div>
          <ul class="info-list">
            <li>CAPTCHA、2FA、想定外ページに遭遇した場合は停止します。</li>
            <li>取込元にない値は無理に埋めず、空のまま扱います。</li>
            <li>既に別の値が入っている欄は、互換と判断できない限り上書きしません。</li>
            <li>失敗時は URL、直前の処理、スクリーンショット、HTML、ログを調査用ファイルとして残します。</li>
          </ul>
        </aside>
      </div>

      <section class="panel">
        <div class="section-head">
          <div>
            <h2>最近の実行履歴</h2>
            <p>画面を開き直した後も、直近の履歴を確認できます。</p>
          </div>
        </div>
        ${renderRecentJobs(jobs)}
      </section>
    `,
  );
}

export function renderJobPage(job: JobRecord): string {
  return renderLayout(
    `ジョブ ${job.id}`,
    `
      <section class="hero-board hero-board-compact">
        <div>
          <p class="eyebrow">ジョブ詳細</p>
          <h2>ジョブ詳細</h2>
          <p>状態、処理の記録、入力予定値、調査用ファイルをこの画面で確認できます。実行中は自動で更新します。</p>
        </div>
        <div class="hero-actions">
          <div class="job-hero-meta">
            <div class="hero-stat">
              <span>ジョブ ID</span>
              <strong><code>${escapeHtml(job.id)}</code></strong>
            </div>
            <div class="hero-stat">
              <span>現在の状態</span>
              <strong>${escapeHtml(statusLabel(job.status))}</strong>
            </div>
          </div>
          <form method="post" action="/api/jobs/${encodeURIComponent(job.id)}/retry" data-retry-form>
            <button type="submit">同条件で再実行</button>
          </form>
        </div>
      </section>

      <section class="panel">
        <div id="job-detail-root" data-job-id="${escapeHtml(job.id)}"></div>
      </section>
    `,
  );
}
