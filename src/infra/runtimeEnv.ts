import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let loaded = false;

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function loadRuntimeEnv(projectRoot: string = process.cwd()): void {
  if (loaded) {
    return;
  }

  loaded = true;
  const envPath = join(projectRoot, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || key in process.env) {
      continue;
    }

    const value = stripWrappingQuotes(trimmed.slice(separatorIndex + 1));
    process.env[key] = value;
  }
}
