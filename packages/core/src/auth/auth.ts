import jwt from "jsonwebtoken";
import { hashString } from "../utils/crypto.ts";
import { getHiveDB } from "../storage/HiveDBStorage.ts";

const JWT_SECRET = process.env.JWT_SECRET || "hive-default-jwt-secret-change-in-production";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: "Bearer";
}

interface JwtPayload {
  userId: string;
  type: "access" | "refresh";
}

interface RefreshTokenDoc {
  userId: string;
  tokenHash: string;
  expiresAt: number;
  revoked: boolean;
}

function tokensCollection() {
  return getHiveDB().then(db => db.collection<RefreshTokenDoc>("refresh_tokens"));
}

export async function generateTokens(userId: string): Promise<AuthTokens> {
  const accessToken = jwt.sign({ userId, type: "access" } satisfies JwtPayload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const refreshToken = jwt.sign({ userId, type: "refresh" } satisfies JwtPayload, JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });

  const refreshTokenHash = hashString(refreshToken);
  const expiresAt = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_EXPIRY_SECONDS;

  const col = await tokensCollection();
  await col.put(refreshTokenHash, { userId, tokenHash: refreshTokenHash, expiresAt, revoked: false });

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60,
    tokenType: "Bearer",
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(refreshToken, JWT_SECRET) as JwtPayload;
  } catch {
    throw new Error("Invalid or expired refresh token");
  }

  if (payload.type !== "refresh") {
    throw new Error("Invalid token type");
  }

  const refreshTokenHash = hashString(refreshToken);
  const col = await tokensCollection();
  const entry = await col.get(refreshTokenHash);

  if (!entry) {
    throw new Error("Refresh token not found");
  }

  const tokenRow = entry.doc;

  if (tokenRow.revoked) {
    throw new Error("Refresh token has been revoked");
  }

  if (tokenRow.expiresAt < Math.floor(Date.now() / 1000)) {
    await col.delete(refreshTokenHash);
    throw new Error("Refresh token has expired");
  }

  await col.delete(refreshTokenHash);

  return generateTokens(payload.userId);
}

export async function validateAccessToken(token: string): Promise<{ userId: string } | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (payload.type !== "access") {
      return null;
    }
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const refreshTokenHash = hashString(refreshToken);
  const col = await tokensCollection();
  const entry = await col.get(refreshTokenHash);
  if (entry) {
    await col.put(refreshTokenHash, { ...entry.doc, revoked: true });
  }
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  const col = await tokensCollection();
  const entries = await col.scan();
  for (const e of entries) {
    if (e.doc.userId === userId && !e.doc.revoked) {
      await col.put(e.id, { ...e.doc, revoked: true });
    }
  }
}
