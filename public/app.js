(function () {
  const STATUS_LABELS = {
    queued: "受付中",
    running: "実行中",
    succeeded: "成功",
    failed: "失敗",
    cancelled: "停止",
  };

  const MODE_LABELS = {
    "dry-run": "確認実行",
    commit: "保存実行",
  };

  const WORKFLOW_LABELS = {
    batter: "野手成績",
    pitcher: "投手成績",
  };

  const LEVEL_LABELS = {
    info: "情報",
    warn: "注意",
    error: "エラー",
  };

  const CONFIDENCE_LABELS = {
    high: "高い",
    medium: "中",
    low: "低い",
    none: "なし",
  };

  const STEP_LABELS = {
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
    "notify.line": "LINE通知",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatDateTime(value) {
    if (!value) {
      return "未設定";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  function labelOf(map, value) {
    return map[value] || value || "-";
  }

  function getWorkflow(job) {
    return job.workflow || job.preview?.workflow || "batter";
  }

  function resultLabelsForWorkflow(workflow) {
    return {
      sourcePlayerCount: workflow === "pitcher" ? "入力した投手数" : "取得した選手数",
      matchedPlayers: workflow === "pitcher" ? "対応できた投手数" : "対応できた人数",
      unmappedPlayers: workflow === "pitcher" ? "対応できなかった投手数" : "対応できなかった人数",
      saveAttempted: "保存処理を行ったか",
      saved: "保存完了を確認したか",
      targetGameUrl: "反映先ページ",
    };
  }

  function renderStatusChip(status) {
    return `<span class="status-chip status-${escapeHtml(status)}">${escapeHtml(labelOf(STATUS_LABELS, status))}</span>`;
  }

  function renderModeChip(mode) {
    return `<span class="mode-chip mode-${escapeHtml(mode)}">${escapeHtml(labelOf(MODE_LABELS, mode))}</span>`;
  }

  function renderEmpty(message) {
    return `<p class="empty-state">${escapeHtml(message)}</p>`;
  }

  function renderKeyValueRows(summary, labels) {
    if (!summary) {
      return renderEmpty("まだ結果はありません。");
    }

    return `
      <dl class="summary-list">
        ${Object.entries(labels)
          .map(([key, label]) => {
            const rawValue = summary[key];
            const displayValue =
              typeof rawValue === "boolean"
                ? rawValue
                  ? "はい"
                  : "いいえ"
                : rawValue ?? "未設定";
            return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(displayValue)}</dd></div>`;
          })
          .join("")}
      </dl>
    `;
  }

  function renderLogs(logs) {
    if (!logs || logs.length === 0) {
      return renderEmpty("処理の記録はまだありません。");
    }

    return `<ul class="timeline-list">${logs
      .map(
        (log) => `
          <li class="timeline-item level-${escapeHtml(log.level)}">
            <div class="timeline-time">${escapeHtml(formatDateTime(log.at))}</div>
            <div class="timeline-body">
              <div class="timeline-head">
                <span class="log-level level-${escapeHtml(log.level)}">${escapeHtml(labelOf(LEVEL_LABELS, log.level))}</span>
                <strong>${escapeHtml(labelOf(STEP_LABELS, log.step))}</strong>
              </div>
              <p>${escapeHtml(log.message)}</p>
              ${
                log.context
                  ? `<pre>${escapeHtml(JSON.stringify(log.context, null, 2))}</pre>`
                  : ""
              }
            </div>
          </li>`,
      )
      .join("")}</ul>`;
  }

  function formatPlateAppearances(plateAppearanceResults) {
    if (!plateAppearanceResults || plateAppearanceResults.length === 0) {
      return '<span class="muted">打席結果なし</span>';
    }

    return plateAppearanceResults
      .map((result) => `${result.appearanceIndex}打席目: ${result.rawText}`)
      .map((text) => `<span class="tag">${escapeHtml(text)}</span>`)
      .join("");
  }

  function renderSourceStats(preview) {
    const stats = preview?.source?.batterStats ?? [];
    if (stats.length === 0) {
      return renderEmpty("取込元の野手成績を取得できていません。");
    }

    return `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>選手</th>
              <th>打順</th>
              <th>守備</th>
              <th>打数</th>
              <th>安打</th>
              <th>打点</th>
              <th>得点</th>
              <th>盗塁</th>
              <th>失策</th>
              <th>打席結果</th>
            </tr>
          </thead>
          <tbody>
            ${stats
              .map(
                (stat) => `
                  <tr>
                    <td data-label="選手">${escapeHtml(stat.playerName)}</td>
                    <td data-label="打順">${escapeHtml(stat.battingOrder ?? "-")}</td>
                    <td data-label="守備">${escapeHtml(stat.position ?? "-")}</td>
                    <td data-label="打数">${escapeHtml(stat.atBats ?? "-")}</td>
                    <td data-label="安打">${escapeHtml(stat.hits ?? "-")}</td>
                    <td data-label="打点">${escapeHtml(stat.rbi ?? "-")}</td>
                    <td data-label="得点">${escapeHtml(stat.runs ?? "未取得")}</td>
                    <td data-label="盗塁">${escapeHtml(stat.stolenBases ?? "-")}</td>
                    <td data-label="失策">${escapeHtml(stat.errors ?? "未取得")}</td>
                    <td data-label="打席結果"><div class="tag-list">${formatPlateAppearances(stat.plateAppearanceResults)}</div></td>
                  </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPitcherAllocations(preview) {
    const allocations = preview?.pitcher?.allocations ?? [];
    if (allocations.length === 0) {
      return renderEmpty("投手割当はまだありません。");
    }

    return `<ul class="warning-list">${allocations
      .map((allocation) => {
        const suffix = allocation.outs > 0 ? `${allocation.innings}回${allocation.outs}/3` : `${allocation.innings}回`;
        return `<li>${escapeHtml(`${allocation.order}. ${allocation.pitcherName} ${suffix}`)}</li>`;
      })
      .join("")}</ul>`;
  }

  function renderPitcherSource(preview) {
    const source = preview?.pitcher?.source;
    if (!source) {
      return renderEmpty("公開試合ページの解析結果はまだありません。");
    }

    if (!source.innings || source.innings.length === 0) {
      return renderEmpty("相手打撃成績をまだ抽出できていません。");
    }

    return `
      <div class="summary-banner">
        <div><strong>公開ページ</strong><span>${escapeHtml(source.sourceUrl)}</span></div>
        <div><strong>対象相手</strong><span>${escapeHtml(source.opponentTeam ?? "未指定")}</span></div>
        <div><strong>打撃表</strong><span>${escapeHtml(source.selectedTableIndex ?? "未検出")}</span></div>
        <div><strong>スコア表</strong><span>${escapeHtml(source.scoreboardTableIndex ?? "未検出")}</span></div>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>回</th>
              <th>失点</th>
              <th>被安打</th>
              <th>被本塁打</th>
              <th>奪三振</th>
              <th>与四球</th>
              <th>与死球</th>
              <th>解析イベント</th>
            </tr>
          </thead>
          <tbody>
            ${source.innings
              .map(
                (inning) => `
                  <tr>
                    <td data-label="回">${escapeHtml(inning.inning)}</td>
                    <td data-label="失点">${escapeHtml(inning.runsAllowed ?? "未取得")}</td>
                    <td data-label="被安打">${escapeHtml(inning.hitsAllowed)}</td>
                    <td data-label="被本塁打">${escapeHtml(inning.homeRunsAllowed)}</td>
                    <td data-label="奪三振">${escapeHtml(inning.strikeouts)}</td>
                    <td data-label="与四球">${escapeHtml(inning.walks)}</td>
                    <td data-label="与死球">${escapeHtml(inning.hitByPitch)}</td>
                    <td data-label="解析イベント">${escapeHtml(inning.rawEvents.join(" / ") || "-")}</td>
                  </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPitcherMapping(preview) {
    const mapping = preview?.pitcher?.mapping;
    const assignments = mapping?.assignments ?? [];
    if (assignments.length === 0) {
      return renderEmpty("投手の対応付け結果はまだありません。");
    }

    return `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>入力投手</th>
              <th>担当回</th>
              <th>対象投手</th>
              <th>入力予定値</th>
              <th>注意事項</th>
            </tr>
          </thead>
          <tbody>
            ${assignments
              .map(
                (assignment) => `
                  <tr>
                    <td data-label="入力投手">${escapeHtml(assignment.allocation.pitcherName)}</td>
                    <td data-label="担当回">${escapeHtml(`${assignment.inningStart} - ${assignment.inningEnd}回`)}</td>
                    <td data-label="対象投手">${escapeHtml(assignment.targetPitcherLabel || "未対応")}</td>
                    <td data-label="入力予定値">${escapeHtml(
                      [
                        `回 ${assignment.derivedStats.innings}`,
                        `アウト ${assignment.derivedStats.outs}`,
                        assignment.derivedStats.runsAllowed === null ? null : `失点 ${assignment.derivedStats.runsAllowed}`,
                        `奪三振 ${assignment.derivedStats.strikeouts}`,
                        `与四球 ${assignment.derivedStats.walks}`,
                        `与死球 ${assignment.derivedStats.hitByPitch}`,
                        `被安打 ${assignment.derivedStats.hitsAllowed}`,
                        `被本塁打 ${assignment.derivedStats.homeRunsAllowed}`,
                      ]
                        .filter(Boolean)
                        .join(" / "),
                    )}</td>
                    <td data-label="注意事項">${escapeHtml((assignment.warnings ?? []).join(" / ") || "なし")}</td>
                  </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPitcherTargetPreview(preview) {
    const target = preview?.pitcher?.target;
    if (!target) {
      return renderEmpty("反映先フォームの情報はまだありません。");
    }

    return `
      <div class="summary-banner">
        <div><strong>反映先ページ</strong><span>${escapeHtml(target.pageUrl)}</span></div>
        <div><strong>送信先</strong><span>${escapeHtml(target.action ?? "不明")} / ${escapeHtml(target.method ?? "不明")}</span></div>
        <div><strong>対象行数</strong><span>${escapeHtml(target.pitcherRows.length)}</span></div>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>行</th>
              <th>投手</th>
              <th>回</th>
              <th>アウト</th>
              <th>失点</th>
              <th>奪三振</th>
              <th>与四球</th>
              <th>与死球</th>
              <th>被安打</th>
              <th>被本塁打</th>
            </tr>
          </thead>
          <tbody>
            ${target.pitcherRows
              .map(
                (row) => `
                  <tr>
                    <td data-label="行">${escapeHtml(row.pitcherIndex ?? "-")}</td>
                    <td data-label="投手">${escapeHtml(row.pitcherLabel || "-")}</td>
                    <td data-label="回">${escapeHtml(row.statFields.innings?.currentValue ?? "-")}</td>
                    <td data-label="アウト">${escapeHtml(row.statFields.outs?.currentValue ?? "-")}</td>
                    <td data-label="失点">${escapeHtml(row.statFields.runsAllowed?.currentValue ?? "-")}</td>
                    <td data-label="奪三振">${escapeHtml(row.statFields.strikeouts?.currentValue ?? "-")}</td>
                    <td data-label="与四球">${escapeHtml(row.statFields.walks?.currentValue ?? "-")}</td>
                    <td data-label="与死球">${escapeHtml(row.statFields.hitByPitch?.currentValue ?? "-")}</td>
                    <td data-label="被安打">${escapeHtml(row.statFields.hitsAllowed?.currentValue ?? "-")}</td>
                    <td data-label="被本塁打">${escapeHtml(row.statFields.homeRunsAllowed?.currentValue ?? "-")}</td>
                  </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderTargetPreview(preview) {
    const target = preview?.target;
    if (!target) {
      return renderEmpty("反映先フォームの情報はまだありません。");
    }

    const rows = target.playerRows
      .map((row) => {
        const appearances = row.appearanceFields
          .map((field) => ({
            appearanceIndex: field.appearanceIndex,
            label: field.main?.currentLabel,
            value: field.main?.currentValue,
          }))
          .filter((field) => field.value && field.value !== "0")
          .map((field) => `${field.appearanceIndex}: ${field.label}`)
          .join(" / ");

        return `
          <tr>
            <td data-label="打順">${escapeHtml(row.lineupIndex ?? "-")}</td>
            <td data-label="選手">${escapeHtml(row.playerLabel)}</td>
            <td data-label="守備">${escapeHtml(row.selectedPositionLabel ?? "-")}</td>
            <td data-label="打点">${escapeHtml(row.statFields.rbi?.currentValue ?? "-")}</td>
            <td data-label="得点">${escapeHtml(row.statFields.runs?.currentValue ?? "-")}</td>
            <td data-label="盗塁">${escapeHtml(row.statFields.stolenBases?.currentValue ?? "-")}</td>
            <td data-label="失策">${escapeHtml(row.statFields.errors?.currentValue ?? "-")}</td>
            <td data-label="現在の入力">${escapeHtml(appearances || "未入力")}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <div class="summary-banner">
        <div><strong>反映先ページ</strong><span>${escapeHtml(target.pageUrl)}</span></div>
        <div><strong>送信先</strong><span>${escapeHtml(target.action ?? "不明")} / ${escapeHtml(target.method ?? "不明")}</span></div>
        <div><strong>対象行数</strong><span>${escapeHtml(target.playerRows.length)}</span></div>
        <div><strong>打席結果の選択肢数</strong><span>${escapeHtml((target.eventOptions ?? []).length)}</span></div>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>打順</th>
              <th>選手</th>
              <th>守備</th>
              <th>打点</th>
              <th>得点</th>
              <th>盗塁</th>
              <th>失策</th>
              <th>現在の打席結果</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderStatPlan(assignment) {
    const plans = [];

    if (assignment.source.rbi !== null) {
      plans.push(`打点 ${assignment.source.rbi}`);
    }
    if (assignment.source.runs !== null) {
      plans.push(`得点 ${assignment.source.runs}`);
    }
    if (assignment.source.stolenBases !== null) {
      plans.push(`盗塁 ${assignment.source.stolenBases}`);
    }
    if (assignment.source.errors !== null) {
      plans.push(`失策 ${assignment.source.errors}`);
    }

    return plans.length === 0
      ? '<span class="muted">集計欄への入力はありません</span>'
      : plans.map((plan) => `<span class="tag">${escapeHtml(plan)}</span>`).join("");
  }

  function renderAppearancePlan(assignment) {
    if (!assignment.appearanceAssignments || assignment.appearanceAssignments.length === 0) {
      return '<span class="muted">打席結果なし</span>';
    }

    return assignment.appearanceAssignments
      .map((appearance) => `${appearance.appearanceIndex}打席目: ${appearance.sourceText} → ${appearance.targetOptionLabel ?? "未対応"}`)
      .map((text) => `<span class="tag">${escapeHtml(text)}</span>`)
      .join("");
  }

  function renderMapping(preview) {
    const assignments = preview?.mapping?.assignments ?? [];
    if (assignments.length === 0) {
      return renderEmpty("対応付けの結果はまだありません。");
    }

    return `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>ソース選手</th>
              <th>対象選手</th>
              <th>一致度</th>
              <th>集計欄への入力</th>
              <th>打席入力予定</th>
              <th>注意事項</th>
            </tr>
          </thead>
          <tbody>
            ${assignments
              .map(
                (assignment) => `
                  <tr>
                    <td data-label="取込元選手">${escapeHtml(assignment.source.playerName)}</td>
                    <td data-label="反映先選手">${escapeHtml(assignment.targetPlayerLabel ?? "未対応")}</td>
                    <td data-label="一致度">${escapeHtml(labelOf(CONFIDENCE_LABELS, assignment.confidence))}</td>
                    <td data-label="集計欄への入力"><div class="tag-list">${renderStatPlan(assignment)}</div></td>
                    <td data-label="打席結果の入力"><div class="tag-list">${renderAppearancePlan(assignment)}</div></td>
                    <td data-label="注意事項">${escapeHtml((assignment.warnings ?? []).join(" / ") || "なし")}</td>
                  </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderWarnings(job) {
    const warnings = [
      ...(job.preview?.warnings ?? []),
      ...(job.preview?.mapping?.warnings ?? []),
    ];

    if (warnings.length === 0) {
      return renderEmpty("注意事項はありません。");
    }

    return `<ul class="warning-list">${warnings
      .map((warning) => `<li>${escapeHtml(warning)}</li>`)
      .join("")}</ul>`;
  }

  function renderArtifacts(paths) {
    if (!paths || paths.length === 0) {
      return renderEmpty("調査用ファイルはまだありません。");
    }

    return `<ul class="artifact-list">${paths
      .map((artifactPath) => {
        const href = "/artifacts/" + artifactPath.split("/").map(encodeURIComponent).join("/");
        return `<li><a href="${href}" target="_blank" rel="noreferrer">${escapeHtml(artifactPath)}</a></li>`;
      })
      .join("")}</ul>`;
  }

  function renderErrorSummary(errorSummary) {
    if (!errorSummary) {
      return renderEmpty("エラーは発生していません。");
    }

    return `
      <div class="error-box">
        <p><strong>内容</strong><br>${escapeHtml(errorSummary.message)}</p>
        <p><strong>発生箇所</strong><br>${escapeHtml(labelOf(STEP_LABELS, errorSummary.step ?? "不明"))}</p>
        <p><strong>発生 URL</strong><br>${escapeHtml(errorSummary.url ?? "不明")}</p>
        <div>
          <strong>考えられる原因</strong>
          <ul class="warning-list">
            ${(errorSummary.candidateCauses ?? []).map((cause) => `<li>${escapeHtml(cause)}</li>`).join("")}
          </ul>
        </div>
      </div>
    `;
  }

  function renderPreviewState(job) {
    const preview = job.preview;
    const workflow = getWorkflow(job);
    if (!preview) {
      return renderEmpty("実行内容の確認結果はまだありません。");
    }

    const commitState = preview.commitReady
      ? '<span class="status-chip status-succeeded">保存実行できます</span>'
      : '<span class="status-chip status-failed">追加の確認が必要です</span>';

    return `
      <div class="summary-banner">
        <div><strong>状態</strong><span>${renderStatusChip(job.status)}</span></div>
        <div><strong>種別</strong><span>${escapeHtml(labelOf(WORKFLOW_LABELS, workflow))}</span></div>
        <div><strong>実行方法</strong><span>${renderModeChip(job.mode)}</span></div>
        <div><strong>保存実行の可否</strong><span>${commitState}</span></div>
        <div><strong>現在の工程</strong><span>${escapeHtml(labelOf(STEP_LABELS, job.lastStep ?? "未設定"))}</span></div>
      </div>
    `;
  }

  function renderJob(job) {
    const workflow = getWorkflow(job);
    const resultLabels = resultLabelsForWorkflow(workflow);
    const sourceDisplay =
      workflow === "pitcher"
        ? job.preview?.pitcher?.source?.sourceUrl || "スカイツリーグ公開試合ページ"
        : job.sourceUrl || job.sourceGameId || "-";

    return `
      ${renderPreviewState(job)}
      <div class="detail-grid">
        <div class="detail-main">
          <section class="subcard">
            <h3>実行結果の要約</h3>
            ${renderKeyValueRows(job.resultSummary, resultLabels)}
          </section>
          <section class="subcard">
            <h3>エラーの内容</h3>
            ${renderErrorSummary(job.errorSummary)}
          </section>
          <section class="subcard">
            <h3>処理の記録</h3>
            ${renderLogs(job.logs)}
          </section>
          <section class="subcard">
            <h3>${escapeHtml(workflow === "pitcher" ? "投手割当" : "取込元の野手成績")}</h3>
            ${workflow === "pitcher" ? renderPitcherAllocations(job.preview) : renderSourceStats(job.preview)}
          </section>
          <section class="subcard">
            <h3>${escapeHtml(workflow === "pitcher" ? "相手打撃成績の解析結果" : "選手の対応付け")}</h3>
            ${workflow === "pitcher" ? renderPitcherSource(job.preview) : renderMapping(job.preview)}
          </section>
          <section class="subcard">
            <h3>${escapeHtml(workflow === "pitcher" ? "投手成績の入力予定" : "反映先フォームの内容")}</h3>
            ${workflow === "pitcher" ? renderPitcherMapping(job.preview) : renderTargetPreview(job.preview)}
          </section>
          ${
            workflow === "pitcher"
              ? `<section class="subcard">
                  <h3>反映先投手フォームの内容</h3>
                  ${renderPitcherTargetPreview(job.preview)}
                </section>`
              : ""
          }
        </div>
        <aside class="detail-side">
          <section class="subcard">
            <h3>基本情報</h3>
            <dl class="summary-list">
              <div><dt>作成日時</dt><dd>${escapeHtml(formatDateTime(job.createdAt))}</dd></div>
              <div><dt>開始日時</dt><dd>${escapeHtml(formatDateTime(job.startedAt))}</dd></div>
              <div><dt>終了日時</dt><dd>${escapeHtml(formatDateTime(job.finishedAt))}</dd></div>
              <div><dt>種別</dt><dd>${escapeHtml(labelOf(WORKFLOW_LABELS, workflow))}</dd></div>
              <div><dt>実行方法</dt><dd>${escapeHtml(labelOf(MODE_LABELS, job.mode))}</dd></div>
              <div><dt>取込元</dt><dd>${escapeHtml(sourceDisplay)}</dd></div>
              <div><dt>反映先試合</dt><dd>${escapeHtml(job.targetGameKey)}</dd></div>
            </dl>
          </section>
          <section class="subcard">
            <h3>注意事項</h3>
            ${renderWarnings(job)}
          </section>
          <section class="subcard">
            <h3>調査用ファイル</h3>
            ${renderArtifacts(job.artifactPaths)}
          </section>
        </aside>
      </div>
    `;
  }

  function updateModeNotice(form) {
    const notice = document.getElementById("mode-notice");
    if (!notice || !form) {
      return;
    }

    const formData = new FormData(form);
    const mode = formData.get("mode");
    if (mode === "commit") {
      notice.className = "notice notice-warning";
      notice.textContent = "保存して確認";
      return;
    }

    notice.className = "notice notice-info";
    notice.textContent = "確認のみ";
  }

  function updateWorkflowSections(form) {
    if (!form) {
      return;
    }

    const workflow = new FormData(form).get("workflow") || "batter";
    form.querySelectorAll("[data-workflow-section]").forEach(function (section) {
      const sectionWorkflow = section.getAttribute("data-workflow-section");
      const isActive = sectionWorkflow === workflow;
      section.hidden = !isActive;
      section.querySelectorAll("input, select, textarea, button").forEach(function (field) {
        field.disabled = !isActive;
      });
    });

    if (workflow === "pitcher") {
      ensurePitcherRows(form);
    }
  }

  function syncMirroredField(form, sourceField) {
    if (!sourceField || !sourceField.name || !sourceField.hasAttribute("data-mirror-field")) {
      return;
    }

    form.querySelectorAll("[data-mirror-field]").forEach(function (field) {
      if (field === sourceField || field.name !== sourceField.name) {
        return;
      }

      field.value = sourceField.value;
    });
  }

  function updateSelectedModeOptions(form) {
    form.querySelectorAll(".mode-option").forEach(function (option) {
      const input = option.querySelector("input");
      option.toggleAttribute("data-selected", Boolean(input?.checked));
    });
  }

  function parsePitcherAllocationText(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean)
      .map(function (line) {
        const match = line.match(/^(.+?)\s+(\d+)(?:回)?$/);
        if (!match) {
          return { pitcherName: line, innings: "" };
        }

        return {
          pitcherName: match[1].trim(),
          innings: match[2].trim(),
        };
      });
  }

  function getPitcherEditorElements(form) {
    return {
      rowsRoot: form.querySelector("#pitcher-rows"),
      template: form.querySelector("#pitcher-row-template"),
      hiddenInput: form.querySelector("#pitcher-allocation-text"),
      addButton: form.querySelector("#pitcher-row-add"),
    };
  }

  function listPitcherRows(form) {
    return Array.from(form.querySelectorAll("[data-pitcher-row]"));
  }

  function updatePitcherRowIndices(form) {
    listPitcherRows(form).forEach(function (row, index) {
      const marker = row.querySelector("[data-pitcher-index]");
      if (marker) {
        marker.textContent = String(index + 1);
      }
    });
  }

  function createPitcherRow(form, values) {
    const elements = getPitcherEditorElements(form);
    if (!elements.rowsRoot || !elements.template) {
      return null;
    }

    const fragment = elements.template.content.cloneNode(true);
    const row = fragment.querySelector("[data-pitcher-row]");
    if (!row) {
      return null;
    }

    const nameInput = row.querySelector("[data-pitcher-name]");
    const inningsInput = row.querySelector("[data-pitcher-innings]");
    if (nameInput) {
      nameInput.value = values?.pitcherName || "";
    }
    if (inningsInput) {
      inningsInput.value = values?.innings || "";
    }

    elements.rowsRoot.appendChild(fragment);
    updatePitcherRowIndices(form);
    return elements.rowsRoot.lastElementChild;
  }

  function ensurePitcherRows(form) {
    if (listPitcherRows(form).length === 0) {
      createPitcherRow(form);
    }
  }

  function syncPitcherAllocation(form) {
    const elements = getPitcherEditorElements(form);
    if (!elements.hiddenInput) {
      return { isValid: true, hasAllocations: false };
    }

    const allocations = listPitcherRows(form)
      .map(function (row) {
        const nameInput = row.querySelector("[data-pitcher-name]");
        const inningsInput = row.querySelector("[data-pitcher-innings]");
        const allocation = {
          pitcherName: String(nameInput?.value || "").trim(),
          innings: String(inningsInput?.value || "").trim(),
        };
        const isFilled = allocation.pitcherName || allocation.innings;
        const isIncomplete = isFilled && (!allocation.pitcherName || !allocation.innings);
        row.toggleAttribute("data-invalid", Boolean(isIncomplete));
        return allocation;
      })
      .filter(function (allocation) {
        return allocation.pitcherName || allocation.innings;
      });

    const hasIncomplete = allocations.some(function (allocation) {
      return !allocation.pitcherName || !allocation.innings;
    });

    if (hasIncomplete) {
      elements.hiddenInput.value = "";
      return {
        isValid: false,
        hasAllocations: true,
        message: "投手名と回を両方入力してください。",
      };
    }

    elements.hiddenInput.value = allocations
      .map(function (allocation) {
        return allocation.pitcherName + " " + allocation.innings + "回";
      })
      .join("\n");

    return {
      isValid: true,
      hasAllocations: allocations.length > 0,
    };
  }

  function initPitcherAllocationEditor(form, errorElement) {
    const elements = getPitcherEditorElements(form);
    if (!elements.rowsRoot || !elements.template || !elements.hiddenInput || !elements.addButton) {
      return;
    }

    const initialRows = parsePitcherAllocationText(elements.hiddenInput.value);
    if (initialRows.length > 0) {
      initialRows.forEach(function (row) {
        createPitcherRow(form, row);
      });
    } else {
      createPitcherRow(form);
    }

    elements.addButton.addEventListener("click", function () {
      const row = createPitcherRow(form);
      if (row) {
        const firstInput = row.querySelector("input");
        firstInput?.focus();
      }
      syncPitcherAllocation(form);
    });

    elements.rowsRoot.addEventListener("click", function (event) {
      const button = event.target.closest("[data-pitcher-remove]");
      if (!button) {
        return;
      }

      const row = button.closest("[data-pitcher-row]");
      row?.remove();
      ensurePitcherRows(form);
      updatePitcherRowIndices(form);
      syncPitcherAllocation(form);
      if (errorElement && errorElement.textContent === "投手名と回を両方入力してください。") {
        errorElement.textContent = "";
      }
    });

    elements.rowsRoot.addEventListener("input", function () {
      syncPitcherAllocation(form);
      if (errorElement && errorElement.textContent === "投手名と回を両方入力してください。") {
        errorElement.textContent = "";
      }
    });
  }

  async function initJobForm() {
    const form = document.getElementById("job-form");
    if (!form) {
      return;
    }

    const errorElement = document.getElementById("job-form-error");
    const submitButton = document.getElementById("job-submit-button");
    initPitcherAllocationEditor(form, errorElement);
    form.addEventListener("input", function (event) {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) {
        return;
      }

      syncMirroredField(form, field);
    });
    form.addEventListener("change", function (event) {
      const field = event.target;
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
        syncMirroredField(form, field);
      }
      updateSelectedModeOptions(form);
      updateWorkflowSections(form);
      updateModeNotice(form);
      syncPitcherAllocation(form);
    });
    updateSelectedModeOptions(form);
    updateWorkflowSections(form);
    updateModeNotice(form);
    syncPitcherAllocation(form);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      errorElement.textContent = "";
      submitButton.disabled = true;
      submitButton.textContent = "送信中...";

      try {
        const workflow = new FormData(form).get("workflow");
        const pitcherState = syncPitcherAllocation(form);
        if (workflow === "pitcher") {
          if (!pitcherState.isValid) {
            errorElement.textContent = pitcherState.message || "投手割当を確認してください。";
            return;
          }
          if (!pitcherState.hasAllocations) {
            errorElement.textContent = "投手を1人以上入力してください。";
            return;
          }
        }

        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        const response = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          errorElement.textContent = data.error || "取り込みを開始できませんでした。";
          return;
        }

        window.location.href = "/jobs/" + encodeURIComponent(data.job.id);
      } catch (_error) {
        errorElement.textContent = "通信エラーが発生しました。";
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "実行";
      }
    });
  }

  async function initJobDetail() {
    const root = document.getElementById("job-detail-root");
    if (!root) {
      return;
    }

    const jobId = root.getAttribute("data-job-id");
    if (!jobId) {
      return;
    }

    async function refresh() {
      try {
        const response = await fetch("/api/jobs/" + encodeURIComponent(jobId));
        const data = await response.json();
        if (!response.ok) {
          root.innerHTML = `<p class="error-text">${escapeHtml(data.error || "ジョブの取得に失敗しました。")}</p>`;
          return;
        }

        root.innerHTML = renderJob(data.job);
        if (data.job.status === "queued" || data.job.status === "running") {
          setTimeout(refresh, 2000);
        }
      } catch (_error) {
        root.innerHTML = '<p class="error-text">ジョブの取得中に通信エラーが発生しました。</p>';
      }
    }

    refresh();
  }

  async function initRetryForms() {
    document.querySelectorAll("[data-retry-form]").forEach(function (form) {
      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        try {
          const response = await fetch(form.getAttribute("action"), { method: "POST" });
          const data = await response.json();
          if (response.ok) {
            window.location.href = "/jobs/" + encodeURIComponent(data.job.id);
          } else {
            window.alert(data.error || "再実行に失敗しました。");
          }
        } catch (_error) {
          window.alert("通信エラーが発生しました。");
        }
      });
    });
  }

  initJobForm();
  initJobDetail();
  initRetryForms();
})();
