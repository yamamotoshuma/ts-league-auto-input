import express from "express";
import { buildParkLotteryTargetLabel, parseParkEntriesText } from "../domain/parkLottery";
import { DuplicateActiveJobError, JobNotFoundError } from "../infra/jsonJobStore";
import type { JobInput, RunMode, TokyoParkAccountSecrets, Workflow } from "../domain/types";
import { JobQueue } from "../worker/jobQueue";
import { ParkSettingsStore } from "../infra/parkSettingsStore";
import { loadTokyoParksSecrets, saveTokyoParksSecrets } from "../infra/secrets";

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseMode(value: unknown): RunMode {
  return value === "commit" ? "commit" : "dry-run";
}

function parseWorkflow(value: unknown): Workflow {
  if (value === "pitcher") {
    return "pitcher";
  }

  if (value === "park-lottery") {
    return "park-lottery";
  }

  return "batter";
}

function parseTargetGameSeasonYear(value: unknown): string | null {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }

  const digits = normalized.replace(/[^0-9]/g, "");
  if (digits.length !== 4) {
    throw new Error("編集シーズンは4桁の西暦で入力してください");
  }

  return digits;
}

function parseJobInput(body: unknown): JobInput {
  if (!body || typeof body !== "object") {
    throw new Error("リクエスト本文は JSON オブジェクトである必要があります");
  }

  const input = body as Record<string, unknown>;
  const workflow = parseWorkflow(input.workflow);
  const sourceGameId = toNullableString(input.sourceGameId);
  const sourceUrl = toNullableString(input.sourceUrl);
  let targetGameKey = toNullableString(input.targetGameKey);
  const pitcherAllocationText = toNullableString(input.pitcherAllocationText);
  const parkEntriesText = toNullableString(input.parkEntriesText);
  const parkEntries = parseParkEntriesText(parkEntriesText);

  if (workflow === "batter" && !sourceGameId && !sourceUrl) {
    throw new Error("ソース試合 ID またはソース試合 URL を入力してください");
  }

  if (workflow === "pitcher" && !pitcherAllocationText) {
    throw new Error("投手割当を1行以上入力してください");
  }

  if (workflow === "park-lottery") {
    if (parkEntries.length === 0) {
      throw new Error("抽選申込みを1件以上入力してください");
    }

    targetGameKey = buildParkLotteryTargetLabel({
      workflow,
      sourceGameId,
      sourceUrl,
      targetGameKey: targetGameKey ?? "",
      targetGameSeasonYear: null,
      targetGameDate: null,
      targetOpponent: null,
      targetVenue: null,
      pitcherAllocationText,
      parkAccountSelector: toNullableString(input.parkAccountSelector),
      parkEntriesText,
      mode: parseMode(input.mode),
    });
  }

  if (!targetGameKey) {
    throw new Error("対象試合の識別キーワードを入力してください");
  }

  return {
    workflow,
    sourceGameId,
    sourceUrl,
    targetGameKey,
    targetGameSeasonYear: parseTargetGameSeasonYear(input.targetGameSeasonYear),
    targetGameDate: toNullableString(input.targetGameDate),
    targetOpponent: toNullableString(input.targetOpponent),
    targetVenue: toNullableString(input.targetVenue),
    pitcherAllocationText,
    parkAccountSelector: toNullableString(input.parkAccountSelector),
    parkEntriesText,
    mode: parseMode(input.mode),
  };
}

function parseTokyoParkAccounts(value: unknown): TokyoParkAccountSecrets[] {
  if (!Array.isArray(value)) {
    throw new Error("アカウント一覧は配列である必要があります");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`アカウント ${index + 1} の形式が不正です`);
    }

    const record = item as Record<string, unknown>;
    const label = toNullableString(record.label);
    const userId = toNullableString(record.userId);
    const password = toNullableString(record.password);
    if (!label || !userId || !password) {
      throw new Error(`アカウント ${index + 1} は表示名・利用者番号・パスワードが必須です`);
    }

    return {
      label,
      userId,
      password,
      enabled: record.enabled !== false,
    };
  });
}

export function createApiRouter(queue: JobQueue, projectRoot: string, parkSettingsStore: ParkSettingsStore) {
  const router = express.Router();

  router.get("/health", (_request, response) => {
    response.json({
      ok: true,
      now: new Date().toISOString(),
    });
  });

  router.get("/jobs", async (_request, response, next) => {
    try {
      response.json({
        jobs: await queue.list(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/jobs/:id", async (request, response, next) => {
    try {
      const job = await queue.get(request.params.id);
      if (!job) {
        response.status(404).json({ error: "ジョブが見つかりません" });
        return;
      }

      response.json({ job });
    } catch (error) {
      next(error);
    }
  });

  router.get("/parks/settings", async (_request, response, next) => {
    try {
      const secrets = await loadTokyoParksSecrets(projectRoot);
      const settings = await parkSettingsStore.get();
      response.json({
        accounts: secrets?.accounts ?? [],
        lastEntries: settings.lastEntries,
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/parks/accounts", async (request, response, next) => {
    try {
      const accounts = parseTokyoParkAccounts((request.body as Record<string, unknown> | null)?.accounts);
      const current = await loadTokyoParksSecrets(projectRoot);
      const saved = await saveTokyoParksSecrets(projectRoot, {
        baseUrl: current?.baseUrl ?? "https://kouen.sports.metro.tokyo.lg.jp/web/index.jsp",
        accounts,
      });
      response.json({
        accounts: saved.accounts,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/jobs", async (request, response, next) => {
    try {
      const input = parseJobInput(request.body);
      if (input.workflow === "park-lottery") {
        await parkSettingsStore.saveLastEntries(parseParkEntriesText(input.parkEntriesText));
      }
      const job = await queue.enqueue(input);
      response.status(202).json({ job });
    } catch (error) {
      if (error instanceof DuplicateActiveJobError) {
        response.status(409).json({
          error: error.message,
          activeJobId: error.jobId,
        });
        return;
      }

      next(error);
    }
  });

  router.post("/jobs/:id/retry", async (request, response, next) => {
    try {
      const job = await queue.retry(request.params.id);
      response.status(202).json({ job });
    } catch (error) {
      if (error instanceof DuplicateActiveJobError) {
        response.status(409).json({
          error: error.message,
          activeJobId: error.jobId,
        });
        return;
      }

      if (error instanceof JobNotFoundError) {
        response.status(404).json({ error: error.message });
        return;
      }

      next(error);
    }
  });

  return router;
}
