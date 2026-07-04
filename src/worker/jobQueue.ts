import { randomUUID } from "node:crypto";
import type {
  AppSecrets,
  AutomationContext,
  JobErrorSummary,
  JobInput,
  JobLogEntry,
  JobRecord,
  JobResultSummary,
  LogLevel,
} from "../domain/types";
import {
  buildJobFailedMessage,
  buildJobSucceededMessage,
} from "../domain/jobNotification";
import { ArtifactStore } from "../infra/artifactStore";
import { DiscordNotifier } from "../infra/discordNotifier";
import { DuplicateActiveJobError, JsonJobStore, JobNotFoundError } from "../infra/jsonJobStore";
import { loadDiscordNotificationSecrets, loadSecrets, SecretsError } from "../infra/secrets";
import { PlaywrightJobRunner } from "../playwright/jobRunner";
import { makeDedupeKey } from "../utils/url";

function now(): string {
  return new Date().toISOString();
}

function createLogEntry(
  level: LogLevel,
  step: string,
  message: string,
  context?: Record<string, unknown>,
): JobLogEntry {
  return {
    at: now(),
    level,
    step,
    message,
    context,
  };
}

function createCandidateCauses(error: unknown): string[] {
  const message = error instanceof Error ? error.message : String(error);
  const causes: string[] = [];

  if (/secret|secrets|認証情報/i.test(message)) {
    causes.push("ローカル secrets ファイルが不足しているか、形式が不正です");
  }

  if (/login|認証|session|セッション/i.test(message)) {
    causes.push("ログイン失敗またはセッション切れの可能性があります");
  }

  if (/table|batter table|DOM|opponent batting|pitcher/i.test(message)) {
    causes.push("取込元または公開試合ページのテーブル構造が想定と一致していない可能性があります");
  }

  if (/公園|抽選|lottery|kouen|park/i.test(message)) {
    causes.push("都立公園の画面構造変更、申込み枠不足、または指定した公園・施設・時間の不一致の可能性があります");
  }

  if (/target game candidate|対象試合/i.test(message)) {
    causes.push("入力した条件では対象試合を特定できなかった可能性があります");
  }

  if (/commit-ready|overwrite|submit|verified|保存|commit/i.test(message)) {
    causes.push("保存フローまたは上書き安全判定で停止しました");
  }

  if (causes.length === 0) {
    causes.push("想定外の実行時エラーです");
  }

  return causes;
}

export class JobQueue {
  private readonly pendingIds: string[] = [];
  private processing = false;

  constructor(
    private readonly projectRoot: string,
    private readonly store: JsonJobStore,
    private readonly artifactStore: ArtifactStore,
    private readonly runner: PlaywrightJobRunner,
  ) {}

  async enqueue(input: JobInput, retryOf: string | null = null): Promise<JobRecord> {
    const dedupeKey = makeDedupeKey(input);
    const active = await this.store.findActiveByDedupeKey(dedupeKey);
    if (active) {
      throw new DuplicateActiveJobError(dedupeKey, active.id);
    }

    const job: JobRecord = {
      id: randomUUID(),
      dedupeKey,
      status: "queued",
      createdAt: now(),
      startedAt: null,
      finishedAt: null,
      logs: [createLogEntry("info", "job.queued", "ジョブを受け付けました")],
      resultSummary: null,
      errorSummary: null,
      preview: null,
      lastStep: "job.queued",
      artifactPaths: [],
      retryOf,
      ...input,
    };

    await this.store.create(job);
    this.schedule(job.id);
    void this.processLoop();
    return job;
  }

  async recoverInterruptedJobs(): Promise<number> {
    const activeJobs = await this.store.listActive();
    for (const job of activeJobs) {
      await this.store.update(job.id, (current) => ({
        ...current,
        status: "failed",
        finishedAt: now(),
        errorSummary:
          current.errorSummary ??
          ({
            message: "前回のアプリ再起動で中断されました。再実行してください。",
            step: current.lastStep,
            url: current.preview?.target?.pageUrl ?? current.preview?.source?.sourceUrl ?? null,
            candidateCauses: ["前回のジョブ実行中にアプリが再起動しました"],
          } satisfies JobErrorSummary),
        logs: [
          ...current.logs,
          createLogEntry("warn", current.lastStep ?? "job.failed", "前回のアプリ再起動でジョブを中断しました"),
        ],
      }));
    }

    return activeJobs.length;
  }

  async retry(jobId: string): Promise<JobRecord> {
    const existing = await this.store.get(jobId);
    if (!existing) {
      throw new JobNotFoundError(jobId);
    }

    return this.enqueue(
      {
        workflow: existing.workflow ?? "batter",
        sourceGameId: existing.sourceGameId,
        sourceUrl: existing.sourceUrl,
        targetGameKey: existing.targetGameKey,
        targetGameSeasonYear: existing.targetGameSeasonYear,
        targetGameDate: existing.targetGameDate,
        targetOpponent: existing.targetOpponent,
        targetVenue: existing.targetVenue,
        pitcherAllocationText: existing.pitcherAllocationText ?? null,
        parkAccountSelector: existing.parkAccountSelector ?? null,
        parkEntriesText: existing.parkEntriesText ?? null,
        mode: existing.mode,
      },
      existing.id,
    );
  }

  async list(limit = 20): Promise<JobRecord[]> {
    return this.store.list(limit);
  }

  async get(jobId: string): Promise<JobRecord | null> {
    return this.store.get(jobId);
  }

  private schedule(jobId: string): void {
    if (!this.pendingIds.includes(jobId)) {
      this.pendingIds.push(jobId);
    }
  }

  private async appendLog(
    jobId: string,
    level: LogLevel,
    step: string,
    message: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.store.update(jobId, (current) => ({
      ...current,
      logs: [...current.logs, createLogEntry(level, step, message, context)],
    }));
  }

  private async loadDiscordNotifier(jobId: string): Promise<DiscordNotifier | null> {
    try {
      const secrets = await loadDiscordNotificationSecrets(this.projectRoot);
      return secrets ? new DiscordNotifier(secrets) : null;
    } catch (error) {
      await this.appendLog(
        jobId,
        "warn",
        "notify.discord",
        error instanceof Error ? error.message : "Discord 通知設定の読み込みに失敗しました",
      );
      return null;
    }
  }

  private async sendNotification(
    jobId: string,
    phase: "succeeded" | "failed",
    job: JobRecord,
  ): Promise<void> {
    const message =
      phase === "succeeded" ? buildJobSucceededMessage(job, job.resultSummary) : buildJobFailedMessage(job, job.errorSummary);

    const discordNotifier = await this.loadDiscordNotifier(jobId);
    if (discordNotifier) {
      try {
        await discordNotifier.send(message);
        await this.appendLog(jobId, "info", "notify.discord", `Discord 通知を送信しました (${phase})`);
      } catch (error) {
        await this.appendLog(
          jobId,
          "warn",
          "notify.discord",
          error instanceof Error ? error.message : "Discord 通知の送信に失敗しました",
        );
      }
    }
  }

  private async processLoop(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      while (this.pendingIds.length > 0) {
        const jobId = this.pendingIds.shift();
        if (!jobId) {
          continue;
        }

        try {
          await this.processOne(jobId);
        } catch (error) {
          console.error(`[job-queue] unexpected error while processing ${jobId}`, error);

          const currentJob = await this.store.get(jobId).catch(() => null);
          try {
            await this.failJob(jobId, error, currentJob);
          } catch (failError) {
            console.error(`[job-queue] failed to mark ${jobId} as failed`, failError);
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async processOne(jobId: string): Promise<void> {
    const job = await this.store.get(jobId);
    if (!job) {
      return;
    }

    await this.store.update(jobId, (current) => ({
      ...current,
      status: "running",
      startedAt: now(),
      lastStep: "job.started",
      logs: [...current.logs, createLogEntry("info", "job.started", "ジョブを開始しました")],
    }));

    let secrets: AppSecrets;
    try {
      secrets = await loadSecrets(this.projectRoot);
    } catch (error) {
      await this.failJob(jobId, error, null);
      return;
    }

    const automationContext: AutomationContext = {
      log: async (level, step, message, context) => {
        await this.store.update(jobId, (current) => ({
          ...current,
          lastStep: step,
          logs: [...current.logs, createLogEntry(level, step, message, context)],
        }));
      },
      attachArtifact: async (relativePath) => {
        await this.store.update(jobId, (current) => ({
          ...current,
          artifactPaths: current.artifactPaths.includes(relativePath)
            ? current.artifactPaths
            : [...current.artifactPaths, relativePath],
        }));
      },
      savePreview: async (preview) => {
        await this.store.update(jobId, (current) => ({
          ...current,
          preview,
        }));
      },
      saveResult: async (result: JobResultSummary) => {
        await this.store.update(jobId, (current) => ({
          ...current,
          resultSummary: result,
        }));
      },
      updateLastStep: async (step) => {
        await this.store.update(jobId, (current) => ({
          ...current,
          lastStep: step,
        }));
      },
    };

    try {
      await this.runner.run(jobId, job, secrets, automationContext);
      await this.store.update(jobId, (current) => ({
        ...current,
        status: "succeeded",
        finishedAt: now(),
        lastStep: current.lastStep ?? "job.succeeded",
        logs: [...current.logs, createLogEntry("info", "job.succeeded", "ジョブが正常終了しました")],
      }));
      const succeededJob = await this.store.get(jobId);
      if (succeededJob) {
        await this.sendNotification(jobId, "succeeded", succeededJob);
      }
    } catch (error) {
      await this.failJob(jobId, error, await this.store.get(jobId));
    }
  }

  private async failJob(
    jobId: string,
    error: unknown,
    currentJob: JobRecord | null,
  ): Promise<void> {
    const latestJob = currentJob ?? (await this.store.get(jobId));
    const message = error instanceof Error ? error.message : String(error);
    const errorSummary: JobErrorSummary = {
      message,
      step: latestJob?.lastStep ?? null,
      url: latestJob?.preview?.target?.pageUrl ?? latestJob?.preview?.source?.sourceUrl ?? null,
      candidateCauses: createCandidateCauses(error),
    };

    await this.store.update(jobId, (current) => ({
      ...current,
      status: "failed",
      finishedAt: now(),
      errorSummary,
      logs: [...current.logs, createLogEntry("error", current.lastStep ?? "job.failed", message)],
    }));

    const failedJob = await this.store.get(jobId);
    if (failedJob) {
      await this.sendNotification(jobId, "failed", failedJob);
    }
  }
}
