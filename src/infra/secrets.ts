import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppSecrets, LineNotificationSecrets, OrderMadeSecrets, TsLeagueSecrets } from "../domain/types";

export class SecretsError extends Error {}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function assertString(value: unknown, field: string, fileLabel: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SecretsError(`${fileLabel}: missing string field "${field}"`);
  }

  return value;
}

export async function loadSecrets(projectRoot: string): Promise<AppSecrets> {
  const orderMadePath = join(projectRoot, "secrets", "order_made.local.json");
  const tsLeaguePath = join(projectRoot, "secrets", "ts_league.local.json");

  let orderMadeRaw: Record<string, unknown>;
  let tsLeagueRaw: Record<string, unknown>;

  try {
    orderMadeRaw = await readJsonFile<Record<string, unknown>>(orderMadePath);
  } catch (error) {
    throw new SecretsError(`missing secrets file: ${orderMadePath}`);
  }

  try {
    tsLeagueRaw = await readJsonFile<Record<string, unknown>>(tsLeaguePath);
  } catch (error) {
    throw new SecretsError(`missing secrets file: ${tsLeaguePath}`);
  }

  const orderMade = validateOrderMadeSecrets(orderMadeRaw);
  const tsLeague = validateTsLeagueSecrets(tsLeagueRaw);
  return { orderMade, tsLeague };
}

export async function loadLineNotificationSecrets(projectRoot: string): Promise<LineNotificationSecrets | null> {
  const notificationPath = join(projectRoot, "secrets", "notifications.local.json");

  let raw: Record<string, unknown>;
  try {
    raw = await readJsonFile<Record<string, unknown>>(notificationPath);
  } catch {
    return null;
  }

  const secrets = validateLineNotificationSecrets(raw);
  if (secrets.accessToken === "SET_LOCALLY" || secrets.recipientId === "SET_LOCALLY") {
    return null;
  }

  return secrets;
}

function validateOrderMadeSecrets(input: Record<string, unknown>): OrderMadeSecrets {
  const orderMade = (input.orderMade ?? input) as Record<string, unknown>;
  return {
    baseUrl: assertString(orderMade.baseUrl, "orderMade.baseUrl", "order_made.local.json"),
    loginUrl: assertString(orderMade.loginUrl, "orderMade.loginUrl", "order_made.local.json"),
    username: assertString(orderMade.username, "orderMade.username", "order_made.local.json"),
    password: assertString(orderMade.password, "orderMade.password", "order_made.local.json"),
  };
}

function validateTsLeagueSecrets(input: Record<string, unknown>): TsLeagueSecrets {
  const tsLeague = (input.tsLeague ?? input) as Record<string, unknown>;
  return {
    loginUrl: assertString(tsLeague.loginUrl, "tsLeague.loginUrl", "ts_league.local.json"),
    gameListUrl: assertString(tsLeague.gameListUrl, "tsLeague.gameListUrl", "ts_league.local.json"),
    username: assertString(tsLeague.username, "tsLeague.username", "ts_league.local.json"),
    password: assertString(tsLeague.password, "tsLeague.password", "ts_league.local.json"),
  };
}

function validateLineNotificationSecrets(input: Record<string, unknown>): LineNotificationSecrets {
  const notifications = (input.notifications ?? input) as Record<string, unknown>;
  const line = (notifications.line ?? notifications) as Record<string, unknown>;

  const apiUrl =
    typeof line.apiUrl === "string" && line.apiUrl.trim() !== ""
      ? line.apiUrl
      : "https://api.line.me/v2/bot/message/push";

  return {
    apiUrl,
    accessToken: assertString(line.accessToken, "line.accessToken", "notifications.local.json"),
    recipientId: assertString(line.recipientId, "line.recipientId", "notifications.local.json"),
  };
}
