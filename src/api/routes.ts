import express from "express";
import { DuplicateActiveJobError, JobNotFoundError } from "../infra/jsonJobStore";
import type { JobInput, RunMode } from "../domain/types";
import { JobQueue } from "../worker/jobQueue";

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

function parseJobInput(body: unknown): JobInput {
  if (!body || typeof body !== "object") {
    throw new Error("リクエスト本文は JSON オブジェクトである必要があります");
  }

  const input = body as Record<string, unknown>;
  const sourceGameId = toNullableString(input.sourceGameId);
  const sourceUrl = toNullableString(input.sourceUrl);
  const targetGameKey = toNullableString(input.targetGameKey);

  if (!sourceGameId && !sourceUrl) {
    throw new Error("ソース試合 ID またはソース試合 URL を入力してください");
  }

  if (!targetGameKey) {
    throw new Error("対象試合の識別キーワードを入力してください");
  }

  return {
    sourceGameId,
    sourceUrl,
    targetGameKey,
    targetGameDate: toNullableString(input.targetGameDate),
    targetOpponent: toNullableString(input.targetOpponent),
    targetVenue: toNullableString(input.targetVenue),
    mode: parseMode(input.mode),
  };
}

export function createApiRouter(queue: JobQueue) {
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

  router.post("/jobs", async (request, response, next) => {
    try {
      const input = parseJobInput(request.body);
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
