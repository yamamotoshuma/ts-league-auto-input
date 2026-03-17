import type { Request, Response, NextFunction } from "express";
import { APP_BASIC_AUTH_REALM } from "../utils/constants";

function decodeBasicAuth(headerValue: string): { user: string; password: string } | null {
  const prefix = "Basic ";
  if (!headerValue.startsWith(prefix)) {
    return null;
  }

  try {
    const decoded = Buffer.from(headerValue.slice(prefix.length), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) {
      return null;
    }

    return {
      user: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function createOptionalBasicAuthMiddleware() {
  const expectedUser = process.env.APP_BASIC_AUTH_USER;
  const expectedPassword = process.env.APP_BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return (_request: Request, _response: Response, next: NextFunction) => next();
  }

  return (request: Request, response: Response, next: NextFunction) => {
    const decoded = decodeBasicAuth(request.headers.authorization ?? "");
    if (!decoded || decoded.user !== expectedUser || decoded.password !== expectedPassword) {
      response.setHeader("WWW-Authenticate", `Basic realm="${APP_BASIC_AUTH_REALM}"`);
      response.status(401).send("認証が必要です");
      return;
    }

    next();
  };
}
