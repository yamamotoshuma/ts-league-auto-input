import express from "express";
import { renderIndexPage, renderJobPage } from "./html";
import { JobQueue } from "../worker/jobQueue";

export function createUiRouter(queue: JobQueue) {
  const router = express.Router();

  router.get("/", async (_request, response, next) => {
    try {
      const jobs = await queue.list();
      response.type("html").send(renderIndexPage(jobs));
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
