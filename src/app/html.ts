import type { JobRecord, JobStatus, RunMode, Workflow } from "../domain/types";

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

function workflowLabel(workflow: Workflow | undefined): string {
  return workflow === "pitcher" ? "投手成績" : "野手成績";
}

function renderRecentJobs(jobs: JobRecord[]): string {
  if (jobs.length === 0) {
    return '<p class="empty-state">履歴はまだありません。</p>';
  }

  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>受付日時</th>
            <th>状態</th>
            <th>種別</th>
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
                  <td data-label="種別">${escapeHtml(workflowLabel(job.workflow))}</td>
                  <td data-label="実行方法"><span class="mode-chip mode-${escapeHtml(job.mode)}">${escapeHtml(modeLabel(job.mode))}</span></td>
                  <td data-label="取込元">${escapeHtml(job.workflow === "pitcher" ? "スカイツリーグ公開試合ページ" : job.sourceUrl ?? job.sourceGameId ?? "-")}</td>
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
          <h1>試合データ反映</h1>
          <p class="header-lead">野手・投手</p>
        </div>
        <nav class="header-nav">
          <a href="/">トップ</a>
        </nav>
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
      <div class="page-stack">
        <section class="panel panel-main">
          <div class="section-head">
            <div>
              <h2>新規実行</h2>
            </div>
          </div>
          <form id="job-form" class="job-form">
            <fieldset class="mode-switch mode-switch-workflow">
              <legend>種別</legend>
              <label class="mode-option">
                <input type="radio" name="workflow" value="batter" checked>
                <span>
                  <strong>野手成績</strong>
                  <small>オーダーメイド</small>
                </span>
              </label>
              <label class="mode-option">
                <input type="radio" name="workflow" value="pitcher">
                <span>
                  <strong>投手成績</strong>
                  <small>公開試合ページ</small>
                </span>
              </label>
            </fieldset>
            <section class="workflow-panel workflow-panel-batter" data-workflow-section="batter">
              <div class="workflow-intro">
                <strong>野手成績</strong>
                <span>オーダーメイドから取込</span>
              </div>
              <div class="workflow-grid">
                <section class="form-card">
                  <div class="card-head">
                    <h3>取込元</h3>
                  </div>
                  <div class="workflow-block">
                    <label class="field">
                      <span class="field-label">ソース試合ID</span>
                      <input name="sourceGameId" placeholder="例: 37">
                    </label>
                    <label class="field field-wide">
                      <span class="field-label">ソース試合URL</span>
                      <input name="sourceUrl" placeholder="例: https://ordermade.sakura.ne.jp/kanri/game/37">
                    </label>
                  </div>
                </section>
                <section class="form-card">
                  <div class="card-head">
                    <h3>反映先</h3>
                  </div>
                  <div class="workflow-block">
                    <label class="field field-wide">
                      <span class="field-label">対象試合</span>
                      <input name="targetGameKey" required data-mirror-field placeholder="例: 3/7 9:00 光が丘公園 Re">
                    </label>
                    <label class="field">
                      <span class="field-label">日付</span>
                      <input name="targetGameDate" type="date" data-mirror-field placeholder="2026-03-07">
                    </label>
                    <label class="field">
                      <span class="field-label">相手</span>
                      <input name="targetOpponent" data-mirror-field placeholder="例: Re">
                    </label>
                    <label class="field field-wide">
                      <span class="field-label">球場</span>
                      <input name="targetVenue" data-mirror-field placeholder="例: 光が丘公園">
                    </label>
                  </div>
                </section>
              </div>
            </section>
            <section class="workflow-panel workflow-panel-pitcher" data-workflow-section="pitcher" hidden>
              <div class="workflow-intro">
                <strong>投手成績</strong>
                <span>公開試合ページから配分</span>
              </div>
              <div class="workflow-grid">
                <section class="form-card form-card-emphasis">
                  <div class="card-head">
                    <h3>投手割当</h3>
                  </div>
                  <input id="pitcher-allocation-text" name="pitcherAllocationText" type="hidden">
                  <section class="pitcher-editor">
                    <div class="pitcher-editor-head">
                      <div>
                        <span class="field-label">登板順</span>
                        <small>投手名 / 回</small>
                      </div>
                      <button id="pitcher-row-add" class="secondary-button" type="button">行を追加</button>
                    </div>
                    <div id="pitcher-rows" class="pitcher-rows"></div>
                  </section>
                  <template id="pitcher-row-template">
                    <div class="pitcher-row" data-pitcher-row>
                      <div class="pitcher-row-index" data-pitcher-index></div>
                      <label class="pitcher-cell">
                        <span>投手名</span>
                        <input type="text" data-pitcher-name placeholder="安楽">
                      </label>
                      <label class="pitcher-cell pitcher-cell-small">
                        <span>回</span>
                        <input type="number" min="0" step="1" inputmode="numeric" data-pitcher-innings placeholder="3">
                      </label>
                      <button class="ghost-button" type="button" data-pitcher-remove>削除</button>
                    </div>
                  </template>
                </section>
                <section class="form-card">
                  <div class="card-head">
                    <h3>反映先</h3>
                  </div>
                  <div class="workflow-block">
                    <label class="field field-wide">
                      <span class="field-label">対象試合</span>
                      <input name="targetGameKey" required data-mirror-field placeholder="例: 3/7 9:00 光が丘公園 Re">
                    </label>
                    <label class="field">
                      <span class="field-label">日付</span>
                      <input name="targetGameDate" type="date" data-mirror-field placeholder="2026-03-07">
                    </label>
                    <label class="field">
                      <span class="field-label">相手</span>
                      <input name="targetOpponent" data-mirror-field placeholder="例: Re">
                    </label>
                    <label class="field field-wide">
                      <span class="field-label">球場</span>
                      <input name="targetVenue" data-mirror-field placeholder="例: 光が丘公園">
                    </label>
                  </div>
                </section>
              </div>
            </section>
            <fieldset class="mode-switch mode-switch-run">
              <legend>実行方法</legend>
              <label class="mode-option">
                <input type="radio" name="mode" value="dry-run" checked>
                <span>
                  <strong>確認実行</strong>
                  <small>保存しない</small>
                </span>
              </label>
              <label class="mode-option">
                <input type="radio" name="mode" value="commit">
                <span>
                  <strong>保存実行</strong>
                  <small>保存する</small>
                </span>
              </label>
            </fieldset>
            <div class="form-footer">
              <div id="mode-notice" class="notice notice-info">保存なし</div>
              <div class="actions">
                <button id="job-submit-button" type="submit">実行</button>
                <span id="job-form-error" class="error-text" role="alert"></span>
              </div>
            </div>
          </form>
        </section>
      </div>

      <section class="panel">
        <div class="section-head">
          <div>
            <h2>実行履歴</h2>
            <p>直近20件</p>
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
      <section class="panel panel-main">
        <div class="section-head">
          <div>
            <h2>ジョブ詳細</h2>
            <p>自動更新</p>
          </div>
          <form method="post" action="/api/jobs/${encodeURIComponent(job.id)}/retry" data-retry-form>
            <button type="submit">同条件で再実行</button>
          </form>
        </div>
        <div class="job-hero-meta">
          <div class="hero-stat">
            <span>ジョブID</span>
            <strong><code>${escapeHtml(job.id)}</code></strong>
          </div>
          <div class="hero-stat">
            <span>現在の状態</span>
            <strong>${escapeHtml(statusLabel(job.status))}</strong>
          </div>
        </div>
      </section>

      <section class="panel">
        <div id="job-detail-root" data-job-id="${escapeHtml(job.id)}"></div>
      </section>
    `,
  );
}
