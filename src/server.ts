import express from "express";
import { join } from "node:path";
import { ArtifactStore } from "./infra/artifactStore";
import { JsonJobStore } from "./infra/jsonJobStore";
import { ParkSettingsStore } from "./infra/parkSettingsStore";
import { PlaywrightJobRunner } from "./playwright/jobRunner";
import { JobQueue } from "./worker/jobQueue";
import { createApiRouter } from "./api/routes";
import { createUiRouter } from "./app/ui";
import { createOptionalAppAuthMiddleware } from "./app/appAuth";
import { loadWebAppAuthSecrets } from "./infra/secrets";
import { DEFAULT_HOST, DEFAULT_PORT } from "./utils/constants";

async function main() {
  const projectRoot = process.cwd();
  const jobStore = new JsonJobStore(join(projectRoot, "data", "jobs.json"));
  const parkSettingsStore = new ParkSettingsStore(join(projectRoot, "data", "park-settings.json"));
  const artifactStore = new ArtifactStore(join(projectRoot, "artifacts"));
  const runner = new PlaywrightJobRunner(projectRoot, artifactStore);
  const queue = new JobQueue(projectRoot, jobStore, artifactStore, runner);

  await jobStore.initialize();
  await parkSettingsStore.initialize();
  await artifactStore.initialize();
  await queue.recoverInterruptedJobs();
  const webAppAuthSecrets = await loadWebAppAuthSecrets(projectRoot);

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(createOptionalAppAuthMiddleware(webAppAuthSecrets));
  app.use(express.static(join(projectRoot, "public")));
  app.use("/styles", express.static(join(projectRoot, "styles")));
  app.use("/artifacts", express.static(join(projectRoot, "artifacts")));
  app.use("/api", createApiRouter(queue, projectRoot, parkSettingsStore));
  app.use(createUiRouter(queue, projectRoot, parkSettingsStore));

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Internal server error";
    response.status(500).json({ error: message });
  });

  const host = process.env.HOST ?? DEFAULT_HOST;
  const port = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

  app.listen(port, host, () => {
    console.log(`Server listening on http://${host}:${port}`);
  });
}

void main();
