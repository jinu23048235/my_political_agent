import type postgres from "postgres";
import type { Viewer } from "./sessions";
import { ApiError } from "./errors";
export type Tx = postgres.TransactionSql;
export type Official = {
  representative_id: string;
  name: string;
  office: string;
};
export async function participation(
  tx: Tx,
  actor: Viewer,
  region: string,
): Promise<Official | null> {
  if (actor.role === "citizen") {
    const [row] =
      await tx`SELECT citizen_can_participate(${actor.id},${region}) AS allowed`;
    if (!row.allowed)
      throw new ApiError(403, "이 지역에 유효한 인증이 필요해요.");
    return null;
  }
  if (actor.role !== "staff" && actor.role !== "representative")
    throw new ApiError(403, "이 계정은 지역 이야기에 참여할 수 없어요.");
  const grants = await officials(tx, actor, region);
  if (grants.length !== 1)
    throw new ApiError(403, "현재 유효한 관할 공식 권한을 확인해주세요.");
  return grants[0];
}
export async function officials(
  tx: Tx,
  actor: Viewer,
  region: string,
): Promise<Official[]> {
  return tx<Official[]>`WITH RECURSIVE ancestors(code,parent_code) AS (
    SELECT code,parent_code FROM regions WHERE code=${region}
    UNION SELECT r.code,r.parent_code FROM regions r JOIN ancestors p ON r.code=p.parent_code
  ) SELECT DISTINCT r.id AS representative_id,r.name,r.office FROM official_grants g
    JOIN representatives r ON r.id=g.representative_id JOIN representative_terms t ON t.id=g.term_id
    JOIN accounts a ON a.id=g.account_id
    WHERE g.account_id=${actor.id} AND g.revoked_at IS NULL AND a.disabled_at IS NULL
      AND a.role IN ('staff','representative') AND t.starts_at<=clock_timestamp() AND t.ends_at>clock_timestamp()
      AND r.region_code IN (SELECT code FROM ancestors)
      AND (a.role='representative' OR g.employment_confirmed_at>clock_timestamp()-interval '3 months')`;
}
export async function lockActor(tx: Tx, actor: Viewer) {
  const [current] =
    await tx`SELECT role FROM accounts WHERE id=${actor.id} AND disabled_at IS NULL FOR UPDATE`;
  if (!current || current.role !== actor.role)
    throw new ApiError(401, "계정 상태가 변경되었어요. 다시 로그인해주세요.");
  if (actor.role === "staff") {
    const due =
      await tx`SELECT 1 FROM official_grants g JOIN representative_terms t ON t.id=g.term_id WHERE g.account_id=${actor.id} AND g.revoked_at IS NULL AND t.starts_at<=clock_timestamp() AND t.ends_at>clock_timestamp() AND (g.employment_confirmed_at IS NULL OR g.employment_confirmed_at<=clock_timestamp()-interval '3 months') LIMIT 1`;
    if (due.length) throw new ApiError(403, "재직·위임 상태 확인이 필요해요.");
  }
}
export async function lockPost(tx: Tx, id: string) {
  const [post] =
    await tx`SELECT * FROM posts WHERE id=${id} AND (visibility='public' OR (visibility='deleted' AND kind='request' AND EXISTS(SELECT 1 FROM replies r WHERE r.post_id=posts.id AND r.visibility='public' AND r.author_role_at_creation IN ('representative','staff')))) FOR UPDATE`;
  if (!post) throw new ApiError(404, "이야기를 찾을 수 없어요.");
  return post;
}
export function ownerOrOperator(actor: Viewer, authorId: string) {
  if (actor.id !== authorId && actor.role !== "operator")
    throw new ApiError(403, "이 항목을 변경할 권한이 없어요.");
}
