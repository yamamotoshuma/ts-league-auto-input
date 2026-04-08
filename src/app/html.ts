import type { JobRecord, JobStatus, ParkLotteryEntryInput, RunMode, TokyoParkAccountSecrets, Workflow } from "../domain/types";

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
  switch (workflow) {
    case "pitcher":
      return "投手成績";
    case "park-lottery":
      return "都立公園抽選";
    default:
      return "野手成績";
  }
}

function sourceLabel(job: JobRecord): string {
  if (job.workflow === "pitcher") {
    return "スカイツリーグ公開試合ページ";
  }

  if (job.workflow === "park-lottery") {
    return "都立公園予約システム";
  }

  return job.sourceUrl ?? job.sourceGameId ?? "-";
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
                  <td data-label="取込元">${escapeHtml(sourceLabel(job))}</td>
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

export function renderLayout(title: string, body: string, section: "ts" | "parks" = "ts"): string {
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
          <h1>自動実行</h1>
          <p class="header-lead">${escapeHtml(section === "parks" ? "都立公園抽選" : "試合データ反映")}</p>
        </div>
        <nav class="header-nav">
          <a href="/"${section === "ts" ? ' aria-current="page"' : ""}>試合反映</a>
          <a href="/parks"${section === "parks" ? ' aria-current="page"' : ""}>都立公園抽選</a>
          <a href="/logout">ログアウト</a>
        </nav>
      </header>
      ${body}
    </main>
    <script src="/app.js" defer></script>
  </body>
</html>`;
}

export function renderLoginPage(errorMessage?: string, nextPath = "/"): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ログイン</title>
    <link rel="stylesheet" href="/styles/app.css">
  </head>
  <body>
    <main class="shell shell-auth">
      <section class="panel panel-main auth-panel">
        <div class="section-head">
          <div>
            <h2>ログイン</h2>
            <p>この Web アプリを使うにはログインが必要です。</p>
          </div>
        </div>
        <form class="job-form auth-form" method="post" action="/login">
          <input type="hidden" name="next" value="${escapeHtml(nextPath)}">
          <label class="field">
            <span class="field-label">ユーザー名</span>
            <input name="username" autocomplete="username" required>
          </label>
          <label class="field">
            <span class="field-label">パスワード</span>
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          ${errorMessage ? `<div class="notice notice-warning">${escapeHtml(errorMessage)}</div>` : ""}
          <div class="form-footer">
            <button type="submit">ログイン</button>
          </div>
        </form>
      </section>
    </main>
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
                        <small>投手名 / 回 / 端数</small>
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
                        <input type="number" min="0" step="1" inputmode="numeric" data-pitcher-innings-whole placeholder="1">
                      </label>
                      <label class="pitcher-cell pitcher-cell-small">
                        <span>端数</span>
                        <select data-pitcher-outs>
                          <option value="">なし</option>
                          <option value="1/3">1/3</option>
                          <option value="2/3">2/3</option>
                        </select>
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
    "ts",
  );
}

export function renderParksPage(
  jobs: JobRecord[],
  accounts: TokyoParkAccountSecrets[],
  lastEntries: ParkLotteryEntryInput[],
): string {
  const initialAccountSelector = accounts.filter((account) => account.enabled).map((account) => account.userId).join(",");
  const serializedAccounts = escapeHtml(JSON.stringify(accounts));
  const serializedEntries = escapeHtml(JSON.stringify(lastEntries));
  return renderLayout(
    "都立公園抽選",
    `
      <div class="page-stack">
        <section class="panel panel-main">
          <div class="section-head">
            <div>
              <h2>都立公園抽選</h2>
            </div>
          </div>
          <form id="job-form" class="job-form">
            <input type="hidden" name="workflow" value="park-lottery">
            <section class="workflow-panel">
              <div class="workflow-intro">
                <strong>抽選申込み</strong>
                <span>1アカウントで全部流してから次へ進む</span>
              </div>
              <div class="workflow-grid workflow-grid-park">
                <section class="form-card">
                  <div class="card-head">
                    <h3>アカウント</h3>
                  </div>
                  <input id="park-account-selector" name="parkAccountSelector" type="hidden" value="${initialAccountSelector}">
                  <input id="park-account-seed" type="hidden" value="${serializedAccounts}">
                  <section class="park-account-editor">
                    <div class="pitcher-editor-head">
                      <div>
                        <span class="field-label">今回使うアカウント</span>
                        <small>表示名、利用者番号、パスワードをそのまま編集できます</small>
                      </div>
                      <button id="park-account-add" class="secondary-button" type="button">追加</button>
                    </div>
                    <div id="park-account-rows" class="park-account-rows"></div>
                    <div class="actions">
                      <button id="park-account-save" class="secondary-button" type="button">アカウント保存</button>
                      <span id="park-account-save-status" class="muted" aria-live="polite"></span>
                    </div>
                  </section>
                  <template id="park-account-template">
                    <div class="park-account-row" data-park-account-row>
                      <div class="park-row-header">
                        <div class="park-row-header-main">
                          <strong>アカウント設定</strong>
                        </div>
                        <div class="park-row-actions">
                          <label class="park-account-toggle">
                            <input type="checkbox" data-park-account-use checked>
                            <span>今回使う</span>
                          </label>
                          <label class="park-account-toggle">
                            <input type="checkbox" data-park-account-enabled checked>
                            <span>有効</span>
                          </label>
                          <button class="ghost-button" type="button" data-park-account-remove>削除</button>
                        </div>
                      </div>
                      <div class="park-form-grid park-account-grid">
                        <label class="pitcher-cell">
                          <span>表示名</span>
                          <input type="text" data-park-account-label placeholder="sample">
                        </label>
                        <label class="pitcher-cell">
                          <span>利用者番号</span>
                          <input type="text" data-park-account-user-id placeholder="10043764">
                        </label>
                        <label class="pitcher-cell park-field-span-full">
                          <span>パスワード</span>
                          <input type="text" data-park-account-password placeholder="password">
                        </label>
                      </div>
                    </div>
                  </template>
                </section>
                <section class="form-card form-card-emphasis">
                  <div class="card-head">
                    <h3>申込み一覧</h3>
                  </div>
                  <input id="park-entries-text" name="parkEntriesText" type="hidden" value="${serializedEntries}">
                  <section class="pitcher-editor">
                    <div class="pitcher-editor-head">
                      <div>
                        <span class="field-label">申込み順</span>
                        <small>前回入力を初期表示。今月変換もできます</small>
                      </div>
                      <div class="actions">
                        <button id="park-entry-shift-current-month" class="secondary-button" type="button">今月に合わせる</button>
                        <button id="park-entry-add" class="secondary-button" type="button">行を追加</button>
                      </div>
                    </div>
                    <div id="park-entry-rows" class="park-entry-rows"></div>
                  </section>
                  <template id="park-entry-template">
                    <div class="park-entry-row" data-park-entry-row>
                      <div class="park-row-header">
                        <div class="park-row-header-main">
                          <div class="pitcher-row-index" data-park-entry-index></div>
                          <strong>申込み</strong>
                        </div>
                        <div class="park-row-actions">
                          <button class="ghost-button" type="button" data-park-entry-remove>削除</button>
                        </div>
                      </div>
                      <div class="park-form-grid park-entry-grid">
                        <label class="pitcher-cell">
                          <span>競技</span>
                          <select data-park-sport>
                            <option value="100">野球</option>
                            <option value="110">野球（小）</option>
                            <option value="120">テニス（ハード）</option>
                            <option value="130">テニス（人工芝）</option>
                            <option value="140">サッカー・ラグビー・ホッケー</option>
                            <option value="150">サッカー（小）</option>
                          </select>
                        </label>
                        <label class="pitcher-cell">
                          <span>申込み番号</span>
                          <select data-park-apply-number>
                            <option value="1">1件目</option>
                            <option value="2">2件目</option>
                          </select>
                        </label>
                        <label class="pitcher-cell">
                          <span>公園</span>
                          <input type="text" data-park-name value="浮間公園" placeholder="浮間公園">
                        </label>
                        <label class="pitcher-cell">
                          <span>施設</span>
                          <input type="text" data-park-facility placeholder="野球場">
                        </label>
                        <label class="pitcher-cell">
                          <span>日付</span>
                          <input type="date" data-park-date>
                        </label>
                        <label class="pitcher-cell">
                          <span>開始</span>
                          <input type="time" data-park-start>
                        </label>
                        <label class="pitcher-cell">
                          <span>終了</span>
                          <input type="time" data-park-end>
                        </label>
                      </div>
                    </div>
                  </template>
                </section>
              </div>
            </section>
            <fieldset class="mode-switch mode-switch-run">
              <legend>実行方法</legend>
              <label class="mode-option">
                <input type="radio" name="mode" value="dry-run" checked>
                <span>
                  <strong>確認実行</strong>
                  <small>申込み確定前まで</small>
                </span>
              </label>
              <label class="mode-option">
                <input type="radio" name="mode" value="commit">
                <span>
                  <strong>保存実行</strong>
                  <small>申込みを送信</small>
                </span>
              </label>
            </fieldset>
            <div class="form-footer">
              <div id="mode-notice" class="notice notice-info">確認のみ</div>
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
    "parks",
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
    job.workflow === "park-lottery" ? "parks" : "ts",
  );
}
