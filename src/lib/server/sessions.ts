import { createHash, randomBytes } from "node:crypto";
import { database } from "./db";
import { dataMode, type Role } from "../domain";
import { ApiError } from "./errors";
export const SESSION_COOKIE = "neighborhood_session";
export type Viewer = {
  id: string;
  role: Role;
  nickname: string;
  staffCheckRequired?: boolean;
};
export function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
// Internal only. Call after verifying the provider identity and resolving its account.
// No public endpoint issues sessions from a caller-supplied account ID.
export async function issueVerifiedSession(accountId: string) {
  const sql = database();
  const accounts =
    await sql`SELECT id FROM accounts WHERE id=${accountId} AND disabled_at IS NULL`;
  if (!accounts.length) throw new ApiError(401, "이용할 수 없는 계정이에요.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await sql`INSERT INTO sessions(token_hash,account_id,expires_at) VALUES (${sessionHash(token)},${accountId},${expiresAt})`;
  return { token, expiresAt };
}
export async function viewerFromToken(token?: string): Promise<Viewer | null> {
  if (dataMode(process.env) !== "database") return null;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const rows = await database()<
    Viewer[]
  >`SELECT a.id,a.role,a.nickname,(a.role='staff' AND EXISTS(SELECT 1 FROM official_grants g JOIN representative_terms t ON t.id=g.term_id WHERE g.account_id=a.id AND g.revoked_at IS NULL AND t.starts_at<=clock_timestamp() AND t.ends_at>clock_timestamp() AND (g.employment_confirmed_at IS NULL OR g.employment_confirmed_at<=clock_timestamp()-interval '3 months'))) AS "staffCheckRequired" FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=${sessionHash(token)} AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND a.disabled_at IS NULL`;
  return rows[0] ?? null;
}
export async function revokeSession(token: string) {
  await database()`UPDATE sessions SET revoked_at=clock_timestamp() WHERE token_hash=${sessionHash(token)}`;
}
export const sessionCookieOptions = (expires: Date) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  expires,
});
