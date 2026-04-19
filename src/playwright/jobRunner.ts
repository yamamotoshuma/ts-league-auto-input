import type { BrowserContext, Page } from "playwright";
import type { ArtifactStore } from "../infra/artifactStore";
import type {
  AppSecrets,
  AutomationContext,
  DryRunPreview,
  JobInput,
  ParkLotteryAccountPreview,
  ParkLotteryEntryPreview,
} from "../domain/types";
import { buildMappingPreview, isCommitReady, verifyAppliedMapping } from "../domain/mapping";
import { buildParkLotteryTargetLabel, isParkLotteryCommitReady, parseParkEntriesText, selectTokyoParkAccounts } from "../domain/parkLottery";
import { buildPitcherMappingPreview, isPitcherCommitReady, verifyAppliedPitcherMapping } from "../domain/pitcherMapping";
import { parsePitcherAllocationText } from "../domain/pitcherAllocation";
import { createContext, createPage } from "./browser";
import { openOrderMadeGame } from "./orderMadeClient";
import { openTsLeaguePublicGame } from "./tsLeaguePublicClient";
import {
  applyMapping,
  inspectTargetForm,
  openTargetGame,
  submitTargetForm,
  verifySubmitResult,
} from "./tsLeagueClient";
import {
  isTokyoParksAuthenticated,
  loginTokyoParks,
  logoutTokyoParks,
  prepareTokyoParkLotteryEntry,
  submitTokyoParkLotteryEntry,
  summarizeParkAccount,
} from "./tokyoParksClient";
import { applyPitcherMapping, ensurePitcherRowCount, inspectPitcherTargetForm, submitPitcherTargetForm } from "./tsLeaguePitcherClient";
import { buildTsLeaguePublicGameUrl, resolveSourceGameUrl } from "../utils/url";

async function captureScreenshot(
  page: Page,
  artifactStore: ArtifactStore,
  jobId: string,
  label: string,
  onAttach: (relativePath: string) => Promise<void>,
): Promise<void> {
  const safeLabel = label.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase();
  const fileName = `${safeLabel}.png`;
  const fullPath = artifactStore.getJobPath(jobId, fileName);
  await artifactStore.ensureJobDir(jobId);
  await page.screenshot({ path: fullPath, fullPage: true });
  await onAttach(artifactStore.toArtifactPath(jobId, fileName));
}

async function captureHtml(
  page: Page,
  artifactStore: ArtifactStore,
  jobId: string,
  label: string,
  onAttach: (relativePath: string) => Promise<void>,
): Promise<void> {
  const safeLabel = label.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase();
  const fileName = `${safeLabel}.html`;
  const content = await page.content();
  await artifactStore.writeText(jobId, fileName, content);
  await onAttach(artifactStore.toArtifactPath(jobId, fileName));
}

export class PlaywrightJobRunner {
  constructor(
    private readonly projectRoot: string,
    private readonly artifactStore: ArtifactStore,
  ) {}

  async run(jobId: string, input: JobInput, secrets: AppSecrets, context: AutomationContext): Promise<void> {
    let browserContext: BrowserContext | null = null;

    try {
      browserContext = await createContext();
      const page = await createPage(browserContext);
      if (input.workflow === "park-lottery") {
        await this.runParkLotteryWorkflow(jobId, input, secrets, context, page);
        return;
      }

      if (input.workflow === "pitcher") {
        await this.runPitcherWorkflow(jobId, input, secrets, context, browserContext, page);
        return;
      }

      await this.runBatterWorkflow(jobId, input, secrets, context, page);
    } catch (error) {
      if (browserContext) {
        const pages = browserContext.pages();
        const activePage = pages[pages.length - 1];
        if (activePage) {
          await captureScreenshot(activePage, this.artifactStore, jobId, "failure", context.attachArtifact).catch(
            () => undefined,
          );
          await captureHtml(activePage, this.artifactStore, jobId, "failure", context.attachArtifact).catch(() => undefined);
          await this.artifactStore
            .writeJson(jobId, "failure-meta.json", {
              url: activePage.url(),
              title: await activePage.title().catch(() => ""),
              error: error instanceof Error ? error.message : String(error),
            })
            .catch(() => undefined);
          await context.attachArtifact(`${jobId}/failure-meta.json`).catch(() => undefined);
        }
      }

      throw error;
    } finally {
      if (browserContext) {
        await browserContext.close().catch(() => undefined);
      }
    }
  }

  private async runBatterWorkflow(
    jobId: string,
    input: JobInput,
    secrets: AppSecrets,
    context: AutomationContext,
    page: Page,
  ): Promise<void> {
    await context.updateLastStep("source.open");
    await context.log("info", "source.open", "Order Made の試合ページを開いています");
    const sourcePreview = await openOrderMadeGame(
      page,
      resolveSourceGameUrl(input, secrets.orderMade.baseUrl),
      secrets.orderMade,
    );
    await captureScreenshot(page, this.artifactStore, jobId, "source-game", context.attachArtifact);

    await context.updateLastStep("target.open-list");
    await context.log("info", "target.open-list", "スカイツリーグの試合一覧を開いています");
    const targetGameResult = await openTargetGame(page, secrets.tsLeague, {
      targetGameKey: input.targetGameKey,
      targetGameSeasonYear: input.targetGameSeasonYear,
      targetGameDate: input.targetGameDate,
      targetOpponent: input.targetOpponent,
      targetVenue: input.targetVenue,
    });
    await context.log("info", "target.game-selected", "対象試合を特定しました", {
      selectedUrl: targetGameResult.selectedUrl,
      candidateCount: targetGameResult.candidates.length,
    });
    await captureScreenshot(page, this.artifactStore, jobId, "target-game-detail", context.attachArtifact);

    await context.updateLastStep("target.inspect-form");
    const targetPreview = await inspectTargetForm(page);
    const mapping = buildMappingPreview(sourcePreview.batterStats, targetPreview);
    const preview: DryRunPreview = {
      workflow: "batter",
      source: sourcePreview,
      target: targetPreview,
      mapping,
      pitcher: null,
      parkLottery: null,
      warnings: [...mapping.warnings],
      commitReady: isCommitReady(mapping),
    };
    await context.savePreview(preview);
    await this.artifactStore.writeJson(jobId, "preview.json", preview);
    await context.attachArtifact(`${jobId}/preview.json`);

    if (input.mode === "dry-run") {
      await context.saveResult({
        message: preview.commitReady
          ? "確認実行が完了し、保存実行に進める状態です"
          : "確認実行は完了しましたが、保存実行の前に確認が必要です",
        sourcePlayerCount: sourcePreview.batterStats.length,
        matchedPlayers: mapping.assignments.filter((assignment) => assignment.targetPlayerLabel !== null).length,
        unmappedPlayers: mapping.unmatchedSourcePlayers.length,
        saveAttempted: false,
        saved: false,
        targetGameUrl: targetGameResult.selectedUrl,
      });
      return;
    }

    if (!preview.commitReady) {
      throw new Error("保存実行が選ばれましたが、安全条件を満たしていません");
    }

    await context.updateLastStep("target.fill-form");
    await context.log("info", "target.fill-form", "対象フォームへ野手成績を反映しています");
    await applyMapping(page, mapping);
    await captureScreenshot(page, this.artifactStore, jobId, "target-filled-form", context.attachArtifact);

    await context.updateLastStep("target.submit-form");
    await context.log("info", "target.submit-form", "保存を実行しています");
    await submitTargetForm(page, targetPreview);
    await captureScreenshot(page, this.artifactStore, jobId, "target-submit-result", context.attachArtifact);
    const saved = await verifySubmitResult(page);
    if (!saved) {
      throw new Error("保存完了画面を確認できませんでした");
    }

    await context.log("info", "target.submit-verified", "完了画面の表示を確認しました", {
      currentUrl: page.url(),
    });

    await context.updateLastStep("target.verify-saved");
    await context.log("info", "target.verify-saved", "保存結果を再読込で検証しています");
    await openTargetGame(page, secrets.tsLeague, {
      targetGameKey: input.targetGameKey,
      targetGameSeasonYear: input.targetGameSeasonYear,
      targetGameDate: input.targetGameDate,
      targetOpponent: input.targetOpponent,
      targetVenue: input.targetVenue,
    });
    const committedTargetPreview = await inspectTargetForm(page);
    await this.artifactStore.writeJson(jobId, "committed-preview.json", committedTargetPreview);
    await context.attachArtifact(`${jobId}/committed-preview.json`);
    await captureScreenshot(page, this.artifactStore, jobId, "target-post-commit", context.attachArtifact);

    const verification = verifyAppliedMapping(mapping, committedTargetPreview);
    if (!verification.verified) {
      throw new Error(`保存後の再読込検証に失敗しました: ${verification.issues.slice(0, 3).join(" / ")}`);
    }

    await context.saveResult({
      message: "保存実行が完了し、再読込による確認も通過しました",
      sourcePlayerCount: sourcePreview.batterStats.length,
      matchedPlayers: mapping.assignments.filter((assignment) => assignment.targetPlayerLabel !== null).length,
      unmappedPlayers: mapping.unmatchedSourcePlayers.length,
      saveAttempted: true,
      saved,
      targetGameUrl: page.url(),
    });
  }

  private async runPitcherWorkflow(
    jobId: string,
    input: JobInput,
    secrets: AppSecrets,
    context: AutomationContext,
    browserContext: BrowserContext,
    page: Page,
  ): Promise<void> {
    const allocations = parsePitcherAllocationText(input.pitcherAllocationText ?? "");

    await context.updateLastStep("target.open-list");
    await context.log("info", "target.open-list", "スカイツリーグの試合一覧を開いています");
    const targetGameResult = await openTargetGame(page, secrets.tsLeague, {
      targetGameKey: input.targetGameKey,
      targetGameSeasonYear: input.targetGameSeasonYear,
      targetGameDate: input.targetGameDate,
      targetOpponent: input.targetOpponent,
      targetVenue: input.targetVenue,
      editAction: "gamedf_edit.php",
    });
    await context.log("info", "target.game-selected", "対象試合を特定しました", {
      selectedUrl: targetGameResult.selectedUrl,
      candidateCount: targetGameResult.candidates.length,
    });
    await captureScreenshot(page, this.artifactStore, jobId, "target-pitcher-form", context.attachArtifact);

    await context.updateLastStep("target.prepare-form");
    await context.log("info", "target.prepare-form", "投手入力行数を確認しています", {
      requestedRows: allocations.length,
    });
    await ensurePitcherRowCount(page, allocations.length);

    await context.updateLastStep("target.inspect-form");
    const targetPreview = await inspectPitcherTargetForm(page);

    const gameId = targetPreview.hiddenInputs.find((input) => input.name === "Id")?.value ?? null;
    const gameYear =
      targetPreview.hiddenInputs.find((input) => input.name === "MemberScoreDfGameYear")?.value ??
      targetPreview.hiddenInputs.find((input) => input.name === "MemberScoreDfGameYear2")?.value ??
      null;
    if (!gameId || !gameYear) {
      throw new Error("公開試合ページの URL を組み立てる hidden input が見つかりませんでした");
    }

    const publicPage = await createPage(browserContext);
    const publicGameUrl = buildTsLeaguePublicGameUrl(gameId, gameYear);
    await context.updateLastStep("source.open");
    await context.log("info", "source.open", "公開試合ページを開いて相手打撃成績を解析しています", {
      publicGameUrl,
    });
    const sourcePreview = await openTsLeaguePublicGame(publicPage, publicGameUrl, input.targetOpponent);
    await captureScreenshot(publicPage, this.artifactStore, jobId, "source-public-game", context.attachArtifact);

    const mapping = buildPitcherMappingPreview(allocations, sourcePreview, targetPreview);
    const warnings = [...sourcePreview.warnings, ...mapping.warnings];
    const preview: DryRunPreview = {
      workflow: "pitcher",
      source: null,
      target: null,
      mapping: null,
      pitcher: {
        allocations,
        source: sourcePreview,
        target: targetPreview,
        mapping,
      },
      parkLottery: null,
      warnings,
      commitReady: isPitcherCommitReady(mapping),
    };
    await context.savePreview(preview);
    await this.artifactStore.writeJson(jobId, "preview.json", preview);
    await context.attachArtifact(`${jobId}/preview.json`);

    if (input.mode === "dry-run") {
      await context.saveResult({
        message: preview.commitReady
          ? "確認実行が完了し、保存実行に進める状態です"
          : "確認実行は完了しましたが、保存実行の前に確認が必要です",
        sourcePlayerCount: allocations.length,
        matchedPlayers: mapping.assignments.filter((assignment) => assignment.targetPitcherLabel !== null).length,
        unmappedPlayers: mapping.unmatchedAllocations.length,
        saveAttempted: false,
        saved: false,
        targetGameUrl: targetGameResult.selectedUrl,
      });
      return;
    }

    if (!preview.commitReady) {
      throw new Error("保存実行が選ばれましたが、安全条件を満たしていません");
    }

    await context.updateLastStep("target.fill-form");
    await context.log("info", "target.fill-form", "対象フォームへ投手成績を反映しています");
    await applyPitcherMapping(page, mapping);
    await captureScreenshot(page, this.artifactStore, jobId, "target-filled-pitcher-form", context.attachArtifact);

    await context.updateLastStep("target.submit-form");
    await context.log("info", "target.submit-form", "保存を実行しています");
    await submitPitcherTargetForm(page, targetPreview);
    await captureScreenshot(page, this.artifactStore, jobId, "target-pitcher-submit-result", context.attachArtifact);
    const saved = await verifySubmitResult(page);
    if (!saved) {
      throw new Error("保存完了画面を確認できませんでした");
    }

    await context.log("info", "target.submit-verified", "完了画面の表示を確認しました", {
      currentUrl: page.url(),
    });

    await context.updateLastStep("target.verify-saved");
    await context.log("info", "target.verify-saved", "保存結果を再読込で検証しています");
    await openTargetGame(page, secrets.tsLeague, {
      targetGameKey: input.targetGameKey,
      targetGameSeasonYear: input.targetGameSeasonYear,
      targetGameDate: input.targetGameDate,
      targetOpponent: input.targetOpponent,
      targetVenue: input.targetVenue,
      editAction: "gamedf_edit.php",
    });
    const committedTargetPreview = await inspectPitcherTargetForm(page);
    await this.artifactStore.writeJson(jobId, "committed-preview.json", committedTargetPreview);
    await context.attachArtifact(`${jobId}/committed-preview.json`);
    await captureScreenshot(page, this.artifactStore, jobId, "target-pitcher-post-commit", context.attachArtifact);

    const verification = verifyAppliedPitcherMapping(mapping, committedTargetPreview);
    if (!verification.verified) {
      throw new Error(`保存後の再読込検証に失敗しました: ${verification.issues.slice(0, 3).join(" / ")}`);
    }

    await context.saveResult({
      message: "保存実行が完了し、再読込による確認も通過しました",
      sourcePlayerCount: allocations.length,
      matchedPlayers: mapping.assignments.filter((assignment) => assignment.targetPitcherLabel !== null).length,
      unmappedPlayers: mapping.unmatchedAllocations.length,
      saveAttempted: true,
      saved,
      targetGameUrl: page.url(),
    });
  }

  private async runParkLotteryWorkflow(
    jobId: string,
    input: JobInput,
    secrets: AppSecrets,
    context: AutomationContext,
    page: Page,
  ): Promise<void> {
    if (!secrets.tokyoParks) {
      throw new Error("secrets/tokyo_parks.local.json が不足しています");
    }

    const entries = parseParkEntriesText(input.parkEntriesText);
    if (entries.length === 0) {
      throw new Error("抽選申込みが1件もありません");
    }

    const accounts = selectTokyoParkAccounts(secrets.tokyoParks.accounts, input.parkAccountSelector);
    if (accounts.length === 0) {
      throw new Error("対象アカウントが見つかりません");
    }

    const accountPreviews: ParkLotteryAccountPreview[] = [];
    const warnings: string[] = [];
    let submittedEntryCount = 0;
    let failedEntryCount = 0;

    for (const account of accounts) {
      const entryPreviews: ParkLotteryEntryPreview[] = [];

      try {
        await context.updateLastStep("park.login");
        await context.log("info", "park.login", "都立公園へログインしています", {
          account: account.label,
          userId: account.userId,
        });
        await loginTokyoParks(page, secrets.tokyoParks, account);
        await captureScreenshot(page, this.artifactStore, jobId, `park-login-${account.userId}`, context.attachArtifact);

        for (let index = 0; index < entries.length; index += 1) {
          const entry = entries[index];
          try {
            await context.updateLastStep("park.entry.prepare");
            await context.log("info", "park.entry.prepare", "抽選申込み内容を確認しています", {
              account: account.label,
              entryIndex: index + 1,
              sport: entry.sportLabel ?? entry.sportClassCode,
              park: entry.parkName,
              facility: entry.facilityName,
              useDate: entry.useDate,
              startTime: entry.startTime,
              endTime: entry.endTime,
              applyNumber: entry.applyNumber,
            });

            let preparedEntryPreview: ParkLotteryEntryPreview | null = null;
            let lastPrepareError: Error | null = null;
            for (let attempt = 0; attempt < 3; attempt += 1) {
              try {
                if (attempt > 0) {
                  const authenticated = await isTokyoParksAuthenticated(page);
                  if (!authenticated) {
                    await context.log("warn", "park.login", "セッション切れのため再ログインします", {
                      account: account.label,
                      entryIndex: index + 1,
                      attempt: attempt + 1,
                    });
                    await loginTokyoParks(page, secrets.tokyoParks, account);
                  } else {
                    await context.log("info", "park.entry.prepare", "ログイン済みのため抽選申込み内容の確認を再試行します", {
                      account: account.label,
                      entryIndex: index + 1,
                      attempt: attempt + 1,
                    });
                  }

                  await context.log("warn", "park.entry.prepare", "抽選申込み内容の確認を再試行します", {
                    account: account.label,
                    entryIndex: index + 1,
                    attempt: attempt + 1,
                  });
                  await page.waitForTimeout(2_000 * (attempt + 1));
                }

                preparedEntryPreview = {
                  ...(await prepareTokyoParkLotteryEntry(page, entry)),
                  entryIndex: index + 1,
                };
                break;
              } catch (error) {
                lastPrepareError = error instanceof Error ? error : new Error(String(error));
              }
            }

            if (!preparedEntryPreview) {
              throw lastPrepareError ?? new Error("抽選申込み内容の確認に失敗しました");
            }

            const entryPreview = preparedEntryPreview;
            await captureScreenshot(
              page,
              this.artifactStore,
              jobId,
              `park-confirm-${account.userId}-${index + 1}`,
              context.attachArtifact,
            );

            if (input.mode === "commit" && entryPreview.status === "ready") {
              await context.updateLastStep("park.entry.submit");
              await context.log("info", "park.entry.submit", "抽選申込みを送信しています", {
                account: account.label,
                entryIndex: index + 1,
              });
              const submittedPreview = await submitTokyoParkLotteryEntry(page, entryPreview);
              entryPreviews.push(submittedPreview);
              if (submittedPreview.status === "submitted") {
                submittedEntryCount += 1;
              } else {
                failedEntryCount += 1;
              }
              await captureScreenshot(
                page,
                this.artifactStore,
                jobId,
                `park-submit-${account.userId}-${index + 1}`,
                context.attachArtifact,
              );
            } else {
              entryPreviews.push(entryPreview);
              if (entryPreview.status === "ready") {
                submittedEntryCount += 1;
              } else {
                failedEntryCount += 1;
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failedEntryCount += 1;
            warnings.push(`${account.label} ${index + 1}件目: ${message}`);
            entryPreviews.push({
              entryIndex: index + 1,
              status: "failed",
              pageUrl: page.url(),
              pageTitle: await page.title().catch(() => null),
              selectedSportLabel: entry.sportLabel,
              selectedParkName: entry.parkName,
              selectedFacilityName: entry.facilityName,
              selectedDateLabel: entry.useDate,
              selectedTimeLabel: `${entry.startTime}-${entry.endTime}`,
              requestedApplyNumber: entry.applyNumber,
              requestedApplyOptionValue: null,
              availableApplyOptions: [],
              warnings: [message],
            });
            await captureScreenshot(
              page,
              this.artifactStore,
              jobId,
              `park-failure-${account.userId}-${index + 1}`,
              context.attachArtifact,
            ).catch(() => undefined);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`${account.label}: ${message}`);
        for (let index = 0; index < entries.length; index += 1) {
          entryPreviews.push({
            entryIndex: index + 1,
            status: "failed",
            pageUrl: page.url(),
            pageTitle: await page.title().catch(() => null),
            selectedSportLabel: entries[index].sportLabel,
            selectedParkName: entries[index].parkName,
            selectedFacilityName: entries[index].facilityName,
            selectedDateLabel: entries[index].useDate,
            selectedTimeLabel: `${entries[index].startTime}-${entries[index].endTime}`,
            requestedApplyNumber: entries[index].applyNumber,
            requestedApplyOptionValue: null,
            availableApplyOptions: [],
            warnings: [message],
          });
          failedEntryCount += 1;
        }
      } finally {
        await context.updateLastStep("park.logout");
        await logoutTokyoParks(page, secrets.tokyoParks.baseUrl).catch(() => undefined);
      }

      accountPreviews.push(summarizeParkAccount(account, entryPreviews));
    }

    const preview: DryRunPreview = {
      workflow: "park-lottery",
      source: null,
      target: null,
      mapping: null,
      pitcher: null,
      parkLottery: {
        requestedAccountSelector: input.parkAccountSelector,
        requestedEntries: entries,
        accountPreviews,
      },
      warnings: [...warnings],
      commitReady:
        input.mode === "commit"
          ? accountPreviews.every((accountPreview) =>
              accountPreview.entryPreviews.every((entryPreview) => entryPreview.status !== "failed"),
            )
          : isParkLotteryCommitReady(accountPreviews),
    };

    await context.savePreview(preview);
    await this.artifactStore.writeJson(jobId, "preview.json", preview);
    await context.attachArtifact(`${jobId}/preview.json`);

    const targetUrl = secrets.tokyoParks.baseUrl;
    await context.saveResult({
      message:
        input.mode === "commit"
          ? failedEntryCount === 0
            ? "都立公園の抽選申込みを送信しました"
            : "都立公園の抽選申込みは一部失敗しました"
          : preview.commitReady
            ? "確認実行が完了し、保存実行に進める状態です"
            : "確認実行は完了しましたが、申込み前に確認が必要です",
      sourcePlayerCount: accounts.length,
      matchedPlayers: submittedEntryCount,
      unmappedPlayers: failedEntryCount,
      saveAttempted: input.mode === "commit",
      saved: input.mode === "commit" && failedEntryCount === 0,
      targetGameUrl: targetUrl,
    });
  }
}
