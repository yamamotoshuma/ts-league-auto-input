import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export class ArtifactStore {
  constructor(private readonly rootDir: string) {}

  async initialize(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  async ensureJobDir(jobId: string): Promise<string> {
    const jobDir = join(this.rootDir, jobId);
    await mkdir(jobDir, { recursive: true });
    return jobDir;
  }

  getJobPath(jobId: string, fileName: string): string {
    return join(this.rootDir, jobId, fileName);
  }

  toArtifactPath(jobId: string, fileName: string): string {
    return `${jobId}/${fileName}`;
  }

  async writeText(jobId: string, fileName: string, content: string): Promise<string> {
    const jobDir = await this.ensureJobDir(jobId);
    const fullPath = join(jobDir, fileName);
    await writeFile(fullPath, content, "utf8");
    return fullPath;
  }

  async writeJson(jobId: string, fileName: string, value: unknown): Promise<string> {
    return this.writeText(jobId, fileName, `${JSON.stringify(value, null, 2)}\n`);
  }
}
