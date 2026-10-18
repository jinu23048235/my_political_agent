import { database } from "./db";
import type { Author, Post, Region, Reply } from "../domain";
export async function dbRegions(): Promise<Region[]> {
  return database()<
    Region[]
  >`SELECT code,name,parent_code AS "parentCode" FROM regions ORDER BY code`;
}
const visible = (sql: ReturnType<typeof database>) =>
  sql`(p.visibility='public' OR (p.visibility='deleted' AND p.kind='request' AND EXISTS(SELECT 1 FROM replies a WHERE a.post_id=p.id AND a.visibility='public' AND a.author_role_at_creation IN ('staff','representative'))))`;
type PostRow = {
  id: string;
  region_code: string;
  region_name: string;
  kind: Post["kind"];
  body: string;
  author_id: string;
  author_name_at_creation: string;
  author_role_at_creation: Author["role"];
  affiliation_at_creation: string | null;
  created_at: Date;
  edited_at: Date | null;
  pinned_reply_id: string | null;
  visibility: string;
  empathy: number;
  reply_count: number;
  external_url: string | null;
};
function author(row: {
  author_id: string;
  author_name_at_creation: string;
  author_role_at_creation: Author["role"];
  affiliation_at_creation: string | null;
}): Author {
  return {
    id: row.author_id,
    name: row.author_name_at_creation,
    role: row.author_role_at_creation,
    ...(row.affiliation_at_creation
      ? { affiliation: row.affiliation_at_creation }
      : {}),
  };
}
function mapPost(row: PostRow): Post {
  return {
    id: row.id,
    regionCode: row.region_code,
    regionName: row.region_name,
    kind: row.kind,
    body: row.visibility === "deleted" ? "삭제된 요청" : row.body,
    deleted: row.visibility === "deleted",
    author: author(row),
    createdAt: row.created_at.toISOString(),
    editedAt: row.edited_at?.toISOString(),
    pinnedReplyId: row.pinned_reply_id,
    empathy: Number(row.empathy),
    replyCount: Number(row.reply_count),
    replies: [],
    link: row.external_url ?? undefined,
  };
}
export async function dbListPosts(
  region: string,
  sort = "latest",
): Promise<Post[]> {
  const sql = database();
  const rows = await sql<PostRow[]>`WITH RECURSIVE subregions(code) AS (
    SELECT code FROM regions WHERE code=${region} UNION SELECT r.code FROM regions r JOIN subregions p ON r.parent_code=p.code
  ) SELECT p.*,r.name AS region_name,(SELECT count(*)::int FROM post_empathy e WHERE e.post_id=p.id) AS empathy,
    (SELECT count(*)::int FROM replies c WHERE c.post_id=p.id AND c.visibility='public') AS reply_count
    FROM posts p JOIN regions r ON r.code=p.region_code WHERE p.region_code IN (SELECT code FROM subregions) AND ${visible(sql)}
    ORDER BY ${sort === "empathy" ? sql`(SELECT count(*) FROM post_empathy e WHERE e.post_id=p.id) DESC,` : sql``} p.created_at DESC,p.id DESC LIMIT 40`;
  return rows.map(mapPost);
}
export async function dbFindPost(
  id: string,
  conversation?: string,
  cursor?: string,
): Promise<Post | undefined> {
  const sql = database();
  const [row] = await sql<
    PostRow[]
  >`SELECT p.*,r.name AS region_name,(SELECT count(*)::int FROM post_empathy e WHERE e.post_id=p.id) AS empathy,
    (SELECT count(*)::int FROM replies c WHERE c.post_id=p.id AND c.visibility='public') AS reply_count FROM posts p JOIN regions r ON r.code=p.region_code WHERE p.id=${id} AND ${visible(sql)}`;
  if (!row) return undefined;
  const post = mapPost(row);
  type ReplyRow = {
    id: string;
    parent_id: string | null;
    body: string;
    author_id: string;
    author_name_at_creation: string;
    author_role_at_creation: Author["role"];
    affiliation_at_creation: string | null;
    created_at: Date;
    visibility: string;
    reply_count: number;
    external_url: string | null;
  };
  // Include every deleted ancestor of a public reply so deep conversations remain reachable.
  const shown = sql`WITH RECURSIVE shown(id,parent_id) AS (
    SELECT id,parent_id FROM replies WHERE post_id=${id} AND visibility='public'
    UNION SELECT r.id,r.parent_id FROM replies r JOIN shown child ON child.parent_id=r.id WHERE r.post_id=${id} AND r.visibility='deleted'
  )`;
  const [parent] = conversation
    ? await sql`${shown} SELECT id FROM shown WHERE id=${conversation}`
    : [];
  const parentId = parent?.id ?? null;
  const [after] = cursor
    ? await sql`SELECT created_at,id FROM replies WHERE id=${cursor} AND post_id=${id} AND parent_id IS NOT DISTINCT FROM ${parentId}`
    : [];
  const scoped = await sql<
    ReplyRow[]
  >`${shown} SELECT r.*,(SELECT count(*)::int FROM shown c WHERE c.parent_id=r.id) AS reply_count FROM replies r WHERE r.post_id=${id}
    AND r.id IN (SELECT id FROM shown) AND r.parent_id IS NOT DISTINCT FROM ${parentId}
    ${after ? sql`AND (r.created_at,r.id)>(${after.created_at},${after.id})` : sql``} ORDER BY r.created_at,r.id LIMIT 101`;
  const extras = await sql<
    ReplyRow[]
  >`${shown} SELECT r.*,(SELECT count(*)::int FROM shown c WHERE c.parent_id=r.id) AS reply_count FROM replies r WHERE r.post_id=${id}
    AND ((r.id=${post.pinnedReplyId} AND r.visibility='public') OR (r.id=${parentId} AND r.id IN (SELECT id FROM shown)))`;
  post.nextReplyCursor = scoped.length > 100 ? scoped[99].id : undefined;
  const rows = [
    ...scoped.slice(0, 100),
    ...extras.filter(
      (row) => !scoped.slice(0, 100).some((r) => r.id === row.id),
    ),
  ];
  post.replies = rows.map((r): Reply => ({
    id: r.id,
    parentId: r.parent_id,
    body: r.visibility === "deleted" ? "삭제된 댓글" : r.body,
    author: author(r),
    createdAt: r.created_at.toISOString(),
    replyCount: Number(r.reply_count),
    deleted: r.visibility === "deleted",
    link: r.external_url ?? undefined,
  }));
  const recipients =
    await sql`SELECT x.representative_id AS "representativeId",r.name,x.status,x.acknowledged_at AS "acknowledgedAt",
    EXISTS(SELECT 1 FROM official_grants g JOIN accounts a ON a.id=g.account_id JOIN representative_terms t ON t.id=g.term_id WHERE g.representative_id=r.id AND g.revoked_at IS NULL AND a.role IN ('staff','representative') AND a.disabled_at IS NULL AND t.ends_at>clock_timestamp() AND t.starts_at<=clock_timestamp()) AS joined
    FROM request_recipients x JOIN representatives r ON r.id=x.representative_id WHERE x.post_id=${id}`;
  post.recipients = recipients.map((r) => ({
    representativeId: r.representativeId as string,
    name: r.name as string,
    status: r.status as string,
    joined: r.joined as boolean,
  }));
  const [survey] = await sql`SELECT id FROM surveys WHERE post_id=${id}`;
  if (survey) post.surveyId = survey.id as string;
  return post;
}

export async function dbRepresentatives(region: string) {
  return database()`WITH RECURSIVE ancestors(code,parent_code) AS (SELECT code,parent_code FROM regions WHERE code=${region} UNION SELECT r.code,r.parent_code FROM regions r JOIN ancestors p ON r.code=p.parent_code) SELECT r.id,r.name,r.office,EXISTS(SELECT 1 FROM official_grants g JOIN accounts a ON a.id=g.account_id JOIN representative_terms t ON t.id=g.term_id WHERE g.representative_id=r.id AND g.revoked_at IS NULL AND a.disabled_at IS NULL AND a.role IN ('representative','staff') AND t.starts_at<=clock_timestamp() AND t.ends_at>clock_timestamp()) AS joined FROM representatives r WHERE r.region_code IN (SELECT code FROM ancestors) ORDER BY r.name`;
}
