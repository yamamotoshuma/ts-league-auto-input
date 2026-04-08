import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ParkLotteryEntryInput } from "../domain/types";

export interface ParkSettingsRecord {
  lastEntries: ParkLotteryEntryInput[];
}

const DEFAULT_PARK_SETTINGS: ParkSettingsRecord = {
  lastEntries: [],
};

export class ParkSettingsStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      await readFile(this.filePath, "utf8");
    } catch {
      await writeFile(this.filePath, `${JSON.stringify(DEFAULT_PARK_SETTINGS, null, 2)}\n`, "utf8");
    }
  }

  async get(): Promise<ParkSettingsRecord> {
    await this.initialize();
    const raw = await readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ParkSettingsRecord>;
    return {
      lastEntries: Array.isArray(parsed.lastEntries) ? parsed.lastEntries : [],
    };
  }

  async saveLastEntries(lastEntries: ParkLotteryEntryInput[]): Promise<void> {
    await this.withWriteLock(async () => {
      const current = await this.get();
      await this.writeAll({
        ...current,
        lastEntries,
      });
    });
  }

  private async writeAll(value: ParkSettingsRecord): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }

  private async withWriteLock(callback: () => Promise<void>): Promise<void> {
    const nextWrite = this.writeChain.then(callback);
    this.writeChain = nextWrite.catch(() => undefined);
    await nextWrite;
  }
}
