import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { JobRecord, JobStatus } from "../domain/types";

type JobList = JobRecord[];

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`job not found: ${jobId}`);
  }
}

export class DuplicateActiveJobError extends Error {
  constructor(public readonly dedupeKey: string, public readonly jobId: string) {
    super(`duplicate active job exists for key ${dedupeKey}: ${jobId}`);
  }
}

export class JsonJobStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      await readFile(this.filePath, "utf8");
    } catch {
      await writeFile(this.filePath, "[]\n", "utf8");
    }
  }

  async list(limit = 20): Promise<JobRecord[]> {
    const jobs = await this.readAll();
    return jobs
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async get(jobId: string): Promise<JobRecord | null> {
    const jobs = await this.readAll();
    return jobs.find((job) => job.id === jobId) ?? null;
  }

  async create(job: JobRecord): Promise<void> {
    await this.withWriteLock(async () => {
      const jobs = await this.readAll();
      jobs.push(job);
      await this.writeAll(jobs);
    });
  }

  async update(jobId: string, updater: (job: JobRecord) => JobRecord): Promise<JobRecord> {
    let updatedJob: JobRecord | null = null;

    await this.withWriteLock(async () => {
      const jobs = await this.readAll();
      const index = jobs.findIndex((job) => job.id === jobId);
      if (index === -1) {
        throw new JobNotFoundError(jobId);
      }

      updatedJob = updater(jobs[index]);
      jobs[index] = updatedJob;
      await this.writeAll(jobs);
    });

    if (!updatedJob) {
      throw new JobNotFoundError(jobId);
    }

    return updatedJob;
  }

  async findActiveByDedupeKey(dedupeKey: string): Promise<JobRecord | null> {
    const jobs = await this.readAll();
    return (
      jobs.find((job) => job.dedupeKey === dedupeKey && isActiveStatus(job.status)) ?? null
    );
  }

  private async readAll(): Promise<JobList> {
    await this.initialize();
    const raw = await readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as JobList;
    return Array.isArray(parsed) ? parsed : [];
  }

  private async writeAll(jobs: JobList): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(jobs, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }

  private async withWriteLock(callback: () => Promise<void>): Promise<void> {
    const nextWrite = this.writeChain.then(callback);
    this.writeChain = nextWrite.catch(() => undefined);
    await nextWrite;
  }
}

function isActiveStatus(status: JobStatus): boolean {
  return status === "queued" || status === "running";
}
