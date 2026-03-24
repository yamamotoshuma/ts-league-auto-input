import type { BrowserContext, Page } from "playwright";
import type { ArtifactStore } from "../infra/artifactStore";
import type { AppSecrets, AutomationContext, DryRunPreview, JobInput } from "../domain/types";
import type { Browser } from "playwright";
import { buildMappingPreview, isCommitReady, verifyAppliedMapping } from "../domain/mapping";
import { buildPitcherMappingPreview, isPitcherCommitReady, verifyAppliedPitcherMapping } from "../domain/pitcherMapping";
import { parsePitcherAllocationText } from "../domain/pitcherAllocation";
import { createBrowser, createContext, createPage } from "./browser";
import { openOrderMadeGame } from "./orderMadeClient";
import { openTsLeaguePublicGame } from "./tsLeaguePublicClient";
import {
  applyMapping,
  inspectTargetForm,
  openTargetGame,
  submitTargetForm,
  verifySubmitResult,
} from "./tsLeagueClient";
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
    let browser: Browser | null = null;

    try {
      browser = await createBrowser();
      const browserContext = await createContext(browser);
      const page = await createPage(browserContext);
      if (input.workflow === "pitcher") {
        await this.runPitcherWorkflow(jobId, input, secrets, context, browserContext, page);
        return;
      }

      await this.runBatterWorkflow(jobId, input, secrets, context, page);
    } catch (error) {
      if (browser) {
        const pages = browser.contexts().flatMap((context) => context.pages());
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
      if (browser) {
        await browser.close();
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
}
