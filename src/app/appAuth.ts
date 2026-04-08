import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { WebAppAuthSecrets } from "../domain/types";
import { renderLoginPage } from "./html";

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

function signValue(value: string, sessionSecret: string): string {
  return createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function createSessionToken(secrets: WebAppAuthSecrets): string {
  const expiresAt = String(Date.now() + SESSION_MAX_AGE_MS);
  return `${expiresAt}.${signValue(expiresAt, secrets.sessionSecret)}`;
}

function readCookie(request: Request, cookieName: string): string | null {
  const rawCookie = request.headers.cookie ?? "";
  for (const part of rawCookie.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const name = trimmed.slice(0, separatorIndex).trim();
    if (name !== cookieName) {
      continue;
    }

    return decodeURIComponent(trimmed.slice(separatorIndex + 1));
  }

  return null;
}

function hasValidSession(request: Request, secrets: WebAppAuthSecrets): boolean {
  const token = readCookie(request, secrets.cookieName);
  if (!token) {
    return false;
  }

  const [expiresAt, signature] = token.split(".", 2);
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) {
    return false;
  }

  if (Number(expiresAt) <= Date.now()) {
    return false;
  }

  const expectedSignature = signValue(expiresAt, secrets.sessionSecret);
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function isEqualCredential(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function setSessionCookie(response: Response, secrets: WebAppAuthSecrets): void {
  const token = createSessionToken(secrets);
  response.setHeader(
    "Set-Cookie",
    `${secrets.cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
      SESSION_MAX_AGE_MS / 1000,
    )}`,
  );
}

function clearSessionCookie(response: Response, secrets: WebAppAuthSecrets): void {
  response.setHeader(
    "Set-Cookie",
    `${secrets.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/logout" ||
    pathname === "/api/health" ||
    pathname === "/app.js" ||
    pathname.startsWith("/styles/")
  );
}

function resolveNextPath(request: Request): string {
  const bodyNext =
    request.body && typeof request.body === "object" && typeof (request.body as Record<string, unknown>).next === "string"
      ? ((request.body as Record<string, unknown>).next as string)
      : "";
  const nextParam = bodyNext || (typeof request.query.next === "string" ? request.query.next : "");
  if (nextParam.startsWith("/") && !nextParam.startsWith("//") && nextParam !== "/login") {
    return nextParam;
  }

  return "/";
}

export function createOptionalAppAuthMiddleware(secrets: WebAppAuthSecrets | null) {
  if (!secrets) {
    return (_request: Request, _response: Response, next: NextFunction) => next();
  }

  return (request: Request, response: Response, next: NextFunction) => {
    const authenticated = hasValidSession(request, secrets);

    if (request.path === "/login" && request.method === "GET") {
      if (authenticated) {
        response.redirect(resolveNextPath(request));
        return;
      }

      response.type("html").send(renderLoginPage(undefined, resolveNextPath(request)));
      return;
    }

    if (request.path === "/login" && request.method === "POST") {
      const username = String((request.body as Record<string, unknown> | undefined)?.username ?? "");
      const password = String((request.body as Record<string, unknown> | undefined)?.password ?? "");

      if (isEqualCredential(username, secrets.username) && isEqualCredential(password, secrets.password)) {
        setSessionCookie(response, secrets);
        response.redirect(resolveNextPath(request));
        return;
      }

      response
        .status(401)
        .type("html")
        .send(renderLoginPage("ログイン情報が一致しません。", resolveNextPath(request)));
      return;
    }

    if (request.path === "/logout") {
      clearSessionCookie(response, secrets);
      response.redirect("/login");
      return;
    }

    if (isPublicPath(request.path) || authenticated) {
      next();
      return;
    }

    if (request.path.startsWith("/api/")) {
      response.status(401).json({ error: "ログインが必要です" });
      return;
    }

    response.redirect(`/login?next=${encodeURIComponent(request.originalUrl || "/")}`);
  };
}
