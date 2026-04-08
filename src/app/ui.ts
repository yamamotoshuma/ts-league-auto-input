import express from "express";
import { renderIndexPage, renderJobPage, renderParksPage } from "./html";
import { JobQueue } from "../worker/jobQueue";
import { ParkSettingsStore } from "../infra/parkSettingsStore";
import { loadTokyoParksSecrets } from "../infra/secrets";

export function createUiRouter(queue: JobQueue, projectRoot: string, parkSettingsStore: ParkSettingsStore) {
  const router = express.Router();

  router.get("/logout", (_request, response) => {
    response.redirect("/");
  });

  router.get("/", async (_request, response, next) => {
    try {
      const jobs = (await queue.list()).filter((job) => job.workflow !== "park-lottery");
      response.type("html").send(renderIndexPage(jobs));
    } catch (error) {
      next(error);
    }
  });

  router.get("/parks", async (_request, response, next) => {
    try {
      const jobs = (await queue.list()).filter((job) => job.workflow === "park-lottery");
      const parkSecrets = await loadTokyoParksSecrets(projectRoot);
      const parkSettings = await parkSettingsStore.get();
      response.type("html").send(renderParksPage(jobs, parkSecrets?.accounts ?? [], parkSettings.lastEntries));
    } catch (error) {
      next(error);
    }
  });

  router.get("/jobs/:id", async (request, response, next) => {
    try {
      const job = await queue.get(request.params.id);
      if (!job) {
        response.status(404).type("html").send("ジョブが見つかりません");
        return;
      }

      response.type("html").send(renderJobPage(job));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
