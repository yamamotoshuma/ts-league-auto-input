import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AppSecrets,
  DiscordNotificationSecrets,
  OrderMadeSecrets,
  TokyoParkAccountSecrets,
  TokyoParksSecrets,
  TsLeagueSecrets,
  WebAppAuthSecrets,
} from "../domain/types";

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
  const tokyoParksPath = join(projectRoot, "secrets", "tokyo_parks.local.json");

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
  return {
    orderMade,
    tsLeague,
    tokyoParks: await loadOptionalTokyoParksSecrets(tokyoParksPath),
  };
}

export async function loadTokyoParksSecrets(projectRoot: string): Promise<TokyoParksSecrets | null> {
  const tokyoParksPath = join(projectRoot, "secrets", "tokyo_parks.local.json");
  return loadOptionalTokyoParksSecrets(tokyoParksPath);
}

export async function loadDiscordNotificationSecrets(projectRoot: string): Promise<DiscordNotificationSecrets | null> {
  const notificationPath = join(projectRoot, "secrets", "notifications.local.json");

  let raw: Record<string, unknown>;
  try {
    raw = await readJsonFile<Record<string, unknown>>(notificationPath);
  } catch {
    return null;
  }

  const notifications = (raw.notifications ?? raw) as Record<string, unknown>;
  const discord = notifications.discord;
  if (!discord || typeof discord !== "object") {
    return null;
  }

  const secrets = validateDiscordNotificationSecrets(raw);
  if (secrets.webhookUrl === "SET_LOCALLY") {
    return null;
  }

  return secrets;
}

export async function loadWebAppAuthSecrets(projectRoot: string): Promise<WebAppAuthSecrets | null> {
  const authPath = join(projectRoot, "secrets", "web_app.local.json");

  let raw: Record<string, unknown>;
  try {
    raw = await readJsonFile<Record<string, unknown>>(authPath);
  } catch {
    return null;
  }

  const secrets = validateWebAppAuthSecrets(raw);
  if (
    secrets.username === "SET_LOCALLY" ||
    secrets.password === "SET_LOCALLY" ||
    secrets.sessionSecret === "SET_LOCALLY"
  ) {
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

async function loadOptionalTokyoParksSecrets(filePath: string): Promise<TokyoParksSecrets | null> {
  let raw: Record<string, unknown>;
  try {
    raw = await readJsonFile<Record<string, unknown>>(filePath);
  } catch {
    return null;
  }

  return validateTokyoParksSecrets(raw);
}

export async function saveTokyoParksSecrets(projectRoot: string, input: TokyoParksSecrets): Promise<TokyoParksSecrets> {
  const filePath = join(projectRoot, "secrets", "tokyo_parks.local.json");
  const normalized = validateTokyoParksSecrets({ tokyoParks: input });
  await mkdir(join(projectRoot, "secrets"), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ tokyoParks: normalized }, null, 2)}\n`, "utf8");
  return normalized;
}

function validateTokyoParksSecrets(input: Record<string, unknown>): TokyoParksSecrets {
  const tokyoParks = (input.tokyoParks ?? input) as Record<string, unknown>;
  const accounts = Array.isArray(tokyoParks.accounts) ? tokyoParks.accounts : null;
  if (!accounts || accounts.length === 0) {
    throw new SecretsError('tokyo_parks.local.json: missing array field "tokyoParks.accounts"');
  }

  return {
    baseUrl:
      typeof tokyoParks.baseUrl === "string" && tokyoParks.baseUrl.trim() !== ""
        ? tokyoParks.baseUrl
        : "https://kouen.sports.metro.tokyo.lg.jp/web/index.jsp",
    accounts: accounts.map((account, index) =>
      validateTokyoParkAccountSecrets(
        (account ?? {}) as Record<string, unknown>,
        `tokyo_parks.local.json.accounts[${index}]`,
      ),
    ),
  };
}

function validateTokyoParkAccountSecrets(
  input: Record<string, unknown>,
  fileLabel: string,
): TokyoParkAccountSecrets {
  return {
    label: assertString(input.label ?? input.userId, `${fileLabel}.label`, fileLabel),
    userId: assertString(input.userId, `${fileLabel}.userId`, fileLabel),
    password: assertString(input.password, `${fileLabel}.password`, fileLabel),
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
  };
}

function validateDiscordNotificationSecrets(input: Record<string, unknown>): DiscordNotificationSecrets {
  const notifications = (input.notifications ?? input) as Record<string, unknown>;
  const discord = notifications.discord as Record<string, unknown>;

  return {
    webhookUrl: assertString(discord.webhookUrl, "discord.webhookUrl", "notifications.local.json"),
  };
}

function validateWebAppAuthSecrets(input: Record<string, unknown>): WebAppAuthSecrets {
  const webApp = (input.webApp ?? input) as Record<string, unknown>;
  return {
    username: assertString(webApp.username, "webApp.username", "web_app.local.json"),
    password: assertString(webApp.password, "webApp.password", "web_app.local.json"),
    sessionSecret: assertString(webApp.sessionSecret, "webApp.sessionSecret", "web_app.local.json"),
    cookieName:
      typeof webApp.cookieName === "string" && webApp.cookieName.trim() !== ""
        ? webApp.cookieName.trim()
        : "ts_league_session",
  };
}
