import { database } from "./db";
import { ApiError, fields, text, uuid } from "./errors";
import {
  lockActor,
  lockPost,
  officials,
  ownerOrOperator,
  participation,
  type Tx,
} from "./access";
import type { Viewer } from "./sessions";
const officialRoles = ["representative", "staff"];
function link(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string")
    throw new ApiError(400, "링크를 확인해주세요.");
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error();
    return url.href;
  } catch {
    throw new ApiError(400, "http 또는 https 링크를 입력해주세요.");
  }
}
function noPhotoUpload(input: Record<string, unknown>) {
  if (
    input.photos !== undefined &&
    (!Array.isArray(input.photos) || input.photos.length)
  )
    throw new ApiError(400, "사진 업로드는 저장소 연결 후 제공해요.");
}
export async function createPost(
  actor: Viewer,
  input: Record<string, unknown>,
) {
  fields(input, [
    "regionCode",
    "kind",
    "body",
    "link",
    "photos",
    "recipientIds",
    "survey",
  ]);
  noPhotoUpload(input);
  const region = text(input.regionCode, "지역", 100),
    body = text(input.body, "이야기");
  const kind = input.kind;
  if (
    !["story", "request", "opinion", "explanation", "progress"].includes(
      String(kind),
    )
  )
    throw new ApiError(400, "이야기 유형을 확인해주세요.");
  if (actor.role === "citizen" && !["story", "request"].includes(String(kind)))
    throw new ApiError(
      403,
      "공식 게시물은 인증된 공식 계정만 작성할 수 있어요.",
    );
  if (actor.role !== "citizen" && ["story", "request"].includes(String(kind)))
    throw new ApiError(400, "공식 게시물 유형을 선택해주세요.");
  const url = link(input.link);
  return database().begin(async (tx) => {
    await lockActor(tx, actor);
    const office = await participation(tx, actor, region);
    const ids = input.recipientIds === undefined ? [] : input.recipientIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
      throw new ApiError(400, "요청 대상을 확인해주세요.");
    const recipients = [...new Set(ids.map(uuid))];
    if (kind === "request" && !recipients.length)
      throw new ApiError(400, "요청할 대표자를 선택해주세요.");
    if (kind !== "request" && recipients.length)
      throw new ApiError(400, "시민 요청에만 전달 대상을 지정할 수 있어요.");
    for (const id of recipients) {
      const rows =
        await tx`WITH RECURSIVE ancestors(code,parent_code) AS (SELECT code,parent_code FROM regions WHERE code=${region} UNION SELECT r.code,r.parent_code FROM regions r JOIN ancestors p ON r.code=p.parent_code) SELECT id FROM representatives WHERE id=${id} AND region_code IN (SELECT code FROM ancestors)`;
      if (!rows.length)
        throw new ApiError(400, "관할 지역의 대표자를 선택해주세요.");
    }
    const [post] =
      await tx`INSERT INTO posts(author_id,author_role_at_creation,author_name_at_creation,affiliation_at_creation,representative_id,region_code,kind,body,external_url) VALUES (${actor.id},${actor.role},${actor.role === "representative" ? office!.name : actor.nickname},${office ? `${office.name} ${office.office}` : null},${office?.representative_id ?? null},${region},${String(kind)},${body},${url}) RETURNING id`;
    for (const id of recipients)
      await tx`INSERT INTO request_recipients(post_id,representative_id) VALUES (${post.id},${id})`;
    if (input.survey !== undefined) {
      if (kind !== "opinion" || !office)
        throw new ApiError(
          400,
          "공식 주민 의견 요청에만 설문을 추가할 수 있어요.",
        );
      const survey = input.survey;
      if (!survey || typeof survey !== "object" || Array.isArray(survey))
        throw new ApiError(400, "설문을 확인해주세요.");
      const s = survey as Record<string, unknown>;
      fields(s, ["question", "choices", "mode", "closesAt"]);
      const question = text(s.question, "설문 질문", 65536);
      if (
        !Array.isArray(s.choices) ||
        s.choices.length < 2 ||
        s.choices.some((c) => typeof c !== "string" || !c.trim())
      )
        throw new ApiError(400, "선택지를 두 개 이상 입력해주세요.");
      const choices = (s.choices as string[]).map((s) => s.trim());
      if (new Set(choices).size !== choices.length)
        throw new ApiError(400, "선택지를 서로 다르게 입력해주세요.");
      if (!["single", "multiple"].includes(String(s.mode)))
        throw new ApiError(400, "선택 방식을 확인해주세요.");
      if (
        typeof s.closesAt !== "string" ||
        !/(Z|[+-]\d\d:\d\d)$/.test(s.closesAt) ||
        !Number.isFinite(Date.parse(s.closesAt))
      )
        throw new ApiError(400, "시간대가 포함된 마감 시각이 필요해요.");
      await tx`INSERT INTO surveys(post_id,question,choices,mode,closes_at) VALUES (${post.id},${question},${choices},${String(s.mode)},${new Date(s.closesAt)})`;
    }
    return { id: post.id };
  });
}
async function editAccess(
  tx: Tx,
  actor: Viewer,
  content: Record<string, unknown>,
  region: string,
) {
  if (content.author_id !== actor.id)
    throw new ApiError(403, "본인이 작성한 내용만 수정할 수 있어요.");
  if (officialRoles.includes(String(content.author_role_at_creation))) {
    if (!officialRoles.includes(actor.role) || !content.representative_id)
      throw new ApiError(403, "현재 유효한 공식 권한이 필요해요.");
    const grants = await officials(tx, actor, region);
    if (!grants.some((g) => g.representative_id === content.representative_id))
      throw new ApiError(403, "작성 당시 소속의 공식 권한이 필요해요.");
  } else await participation(tx, actor, region);
}
export async function editPost(
  actor: Viewer,
  id: string,
  input: Record<string, unknown>,
) {
  fields(input, ["body", "link"]);
  const body = text(input.body, "이야기");
  return database().begin(async (tx) => {
    await lockActor(tx, actor);
    const post = await lockPost(tx, id);
    if (post.visibility !== "public")
      throw new ApiError(409, "삭제된 글은 수정할 수 없어요.");
    await editAccess(tx, actor, post, String(post.region_code));
    const [row] =
      await tx`UPDATE posts SET body=${body},external_url=${input.link === undefined ? post.external_url : link(input.link)} WHERE id=${id} RETURNING id,edited_at AS "editedAt"`;
    return row;
  });
}
export async function deletePost(actor: Viewer, id: string) {
  return database().begin(async (tx) => {
    await lockActor(tx, actor);
    const post = await lockPost(tx, id);
    ownerOrOperator(actor, String(post.author_id));
    await tx`UPDATE posts SET visibility='deleted' WHERE id=${id}`;
    return { deleted: true };
  });
}
export async function addReply(
  actor: Viewer,
  id: string,
  input: Record<string, unknown>,
) {
  fields(input, ["body", "parentId", "link", "photos"]);
  noPhotoUpload(input);
  const body = text(input.body, "답글");
  const parent =
    input.parentId === null || input.parentId === undefined
      ? null
      : uuid(input.parentId);
  return database().begin(async (tx) => {
    await lockActor(tx, actor);
    const post = await lockPost(tx, id);
    const office = await participation(tx, actor, String(post.region_code));
    if (parent) {
      const rows =
        await tx`SELECT id FROM replies WHERE id=${parent} AND post_id=${id} AND visibility='public'`;
      if (!rows.length)
        throw new ApiError(400, "이 글의 공개 답글에만 이어 쓸 수 있어요.");
    }
    const [reply] =
      await tx`INSERT INTO replies(post_id,parent_id,author_id,author_role_at_creation,author_name_at_creation,affiliation_at_creation,representative_id,body,external_url) VALUES (${id},${parent},${actor.id},${actor.role},${actor.role === "representative" ? office!.name : actor.nickname},${office ? `${office.name} ${office.office}` : null},${office?.representative_id ?? null},${body},${link(input.link)}) RETURNING id`;
    if (office && post.kind === "request")
      await tx`UPDATE request_recipients SET status='answered',updated_at=clock_timestamp() WHERE post_id=${id} AND representative_id=${office.representative_id}`;
    return { id: reply.id };
  });
}
export async function changeReply(
  actor: Viewer,
  replyId: string,
  input: Record<string, unknown> | null,
) {
  if (input) fields(input, ["body", "link"]);
  return database().begin(async (tx) => {
    await lockActor(tx, actor);
    const [reference] =
      await tx`SELECT post_id FROM replies WHERE id=${replyId}`;
    if (!reference) throw new ApiError(404, "답글을 찾을 수 없어요.");
    const post = await lockPost(tx, String(reference.post_id));
    const [reply] =
      await tx`SELECT * FROM replies WHERE id=${replyId} AND visibility='public' FOR UPDATE`;
    if (!reply) throw new ApiError(404, "답글을 찾을 수 없어요.");
    if (input) {
      await editAccess(tx, actor, reply, String(post.region_code));
      await tx`UPDATE replies SET body=${text(input.body, "답글")},external_url=${input.link === undefined ? reply.external_url : link(input.link)} WHERE id=${replyId}`;
    } else {
      ownerOrOperator(actor, String(reply.author_id));
      await tx`UPDATE replies SET visibility='deleted' WHERE id=${replyId}`;
      if (
        reply.representative_id &&
        officialRoles.includes(String(reply.author_role_at_creation))
      )
        await tx`UPDATE request_recipients SET status='on_hold',updated_at=clock_timestamp() WHERE post_id=${post.id} AND representative_id=${reply.representative_id} AND NOT EXISTS(SELECT 1 FROM replies r WHERE r.post_id=${post.id} AND r.representative_id=${reply.representative_id} AND r.visibility='public' AND r.author_role_at_creation IN ('staff','representative'))`;
    }
    return { id: replyId, deleted: !input };
  });
}
export async function pinReply(
  actor: Viewer,
  id: string,
  input: Record<string, unknown>,
) {
  fields(input, ["replyId"]);
  const target = input.replyId === null ? null : uuid(input.replyId);
  return database().begin(async (tx) => {
    await lockActor(tx, actor);
    const post = await lockPost(tx, id);
    ownerOrOperator(actor, String(post.author_id));
    if (target) {
      const rows =
        await tx`SELECT id FROM replies WHERE id=${target} AND post_id=${id} AND visibility='public'`;
      if (!rows.length)
        throw new ApiError(400, "이 글의 공개 댓글만 고정할 수 있어요.");
    }
    await tx`UPDATE posts SET pinned_reply_id=${target} WHERE id=${id}`;
    return { pinnedReplyId: target };
  });
}
export async function empathy(actor: Viewer, id: string) {
  return database().begin(async (tx) => {
    await lockActor(tx, actor);
    const post = await lockPost(tx, id);
    if (actor.role !== "citizen" || post.visibility !== "public")
      throw new ApiError(403, "해당 지역 인증 시민만 공감할 수 있어요.");
    await participation(tx, actor, String(post.region_code));
    await tx`INSERT INTO post_empathy(post_id,account_id) VALUES (${id},${actor.id}) ON CONFLICT DO NOTHING`;
    const [row] =
      await tx`SELECT count(*)::int AS count FROM post_empathy WHERE post_id=${id}`;
    return row;
  });
}
export async function vote(
  actor: Viewer,
  id: string,
  input: Record<string, unknown>,
) {
  fields(input, ["selectedIndexes"]);
  const indexes = input.selectedIndexes;
  if (
    !Array.isArray(indexes) ||
    !indexes.length ||
    indexes.some((i) => !Number.isSafeInteger(i))
  )
    throw new ApiError(400, "선택지를 확인해주세요.");
  return database().begin(async (tx) => {
    await lockActor(tx, actor);
    await tx`INSERT INTO survey_responses(survey_id,account_id,selected_indexes) VALUES (${id},${actor.id},${indexes as number[]}) ON CONFLICT(survey_id,account_id) DO UPDATE SET selected_indexes=EXCLUDED.selected_indexes`;
    return { submitted: true };
  });
}
export async function surveyView(id: string, actor: Viewer | null) {
  const sql = database();
  const [s] =
    await sql`SELECT s.id,s.question,s.choices,s.mode,s.closes_at AS "closesAt",s.closes_at<=clock_timestamp() AS closed,p.region_code AS "regionCode" FROM surveys s JOIN posts p ON p.id=s.post_id WHERE s.id=${id} AND p.visibility='public'`;
  if (!s) throw new ApiError(404, "설문을 찾을 수 없어요.");
  const own = actor
    ? await sql`SELECT selected_indexes AS choices FROM survey_responses WHERE survey_id=${id} AND account_id=${actor.id}`
    : [];
  const results = s.closed
    ? await sql`SELECT choice_index AS "choiceIndex",response_count::int AS "responseCount",participant_count::int AS "participantCount" FROM public_survey_results WHERE survey_id=${id} ORDER BY choice_index`
    : null;
  const [permission] = actor
    ? await sql`SELECT citizen_can_participate(${actor.id},${s.regionCode}) AS allowed`
    : [{ allowed: false }];
  return {
    ...s,
    myChoices: own[0]?.choices ?? null,
    canVote: !s.closed && Boolean(permission.allowed),
    results,
  };
}
export async function settings(actor: Viewer, input?: Record<string, unknown>) {
  return database().begin(async (tx) => {
    await lockActor(tx, actor);
    if (input) {
      fields(input, [
        "nickname",
        "requestAcknowledged",
        "officialAnswer",
        "additionalReply",
        "representativeNotifications",
      ]);
      if (input.nickname !== undefined)
        await tx`UPDATE accounts SET nickname=${text(input.nickname, "닉네임", 65536).trim()} WHERE id=${actor.id}`;
      if (input.representativeNotifications !== undefined) {
        if (!Array.isArray(input.representativeNotifications))
          throw new ApiError(400, "대표자 알림 설정을 확인해주세요.");
        for (const entry of input.representativeNotifications) {
          if (!entry || typeof entry !== "object" || Array.isArray(entry))
            throw new ApiError(400, "알림 설정을 확인해주세요.");
          fields(entry, ["id", "enabled"]);
          if (typeof entry.enabled !== "boolean")
            throw new ApiError(400, "알림 설정을 확인해주세요.");
          const changed =
            await tx`UPDATE follows SET notify_new_posts=${entry.enabled} WHERE account_id=${actor.id} AND representative_id=${uuid(entry.id)} RETURNING representative_id`;
          if (!changed.length)
            throw new ApiError(404, "팔로우한 대표자를 확인해주세요.");
        }
      }
      for (const key of [
        "requestAcknowledged",
        "officialAnswer",
        "additionalReply",
      ])
        if (input[key] !== undefined && typeof input[key] !== "boolean")
          throw new ApiError(400, "알림 설정을 확인해주세요.");
      await tx`INSERT INTO notification_preferences(account_id) VALUES (${actor.id}) ON CONFLICT DO NOTHING`;
      await tx`UPDATE notification_preferences SET request_acknowledged=coalesce(${(input.requestAcknowledged as boolean | undefined) ?? null}::boolean,request_acknowledged),official_answer=coalesce(${(input.officialAnswer as boolean | undefined) ?? null}::boolean,official_answer),additional_reply=coalesce(${(input.additionalReply as boolean | undefined) ?? null}::boolean,additional_reply) WHERE account_id=${actor.id}`;
    }
    const [profile] = await tx<
      { id: string; nickname: string; role: string }[]
    >`SELECT id,nickname,role FROM accounts WHERE id=${actor.id}`;
    const [prefs] = await tx<
      {
        requestAcknowledged: boolean;
        officialAnswer: boolean;
        additionalReply: boolean;
      }[]
    >`SELECT request_acknowledged AS "requestAcknowledged",official_answer AS "officialAnswer",additional_reply AS "additionalReply" FROM notification_preferences WHERE account_id=${actor.id}`;
    const follows = await tx<
      { id: string; name: string; enabled: boolean }[]
    >`SELECT r.id,r.name,f.notify_new_posts AS enabled FROM follows f JOIN representatives r ON r.id=f.representative_id WHERE f.account_id=${actor.id} ORDER BY r.name`;
    return {
      ...profile,
      representativeNotifications: follows,
      preferences: prefs ?? {
        requestAcknowledged: true,
        officialAnswer: true,
        additionalReply: true,
      },
    };
  });
}
export async function acknowledge(
  actor: Viewer,
  postId: string,
  representativeId: string,
  input: Record<string, unknown>,
) {
  fields(input, ["status"]);
  if (!["acknowledged", "on_hold"].includes(String(input.status)))
    throw new ApiError(
      400,
      "직접 접수 확인 또는 답변 보류만 선택할 수 있어요.",
    );
  return database().begin(async (tx) => {
    await lockActor(tx, actor);
    const post = await lockPost(tx, postId);
    const grants = await officials(tx, actor, String(post.region_code));
    if (!grants.some((g) => g.representative_id === representativeId))
      throw new ApiError(403, "해당 대표자의 공식 권한이 필요해요.");
    const [recipient] =
      await tx`SELECT * FROM request_recipients WHERE post_id=${postId} AND representative_id=${representativeId} FOR UPDATE`;
    if (!recipient) throw new ApiError(404, "요청 대상을 찾을 수 없어요.");
    if (input.status === "on_hold" && !recipient.acknowledged_at)
      throw new ApiError(409, "접수 확인 후 보류할 수 있어요.");
    await tx`UPDATE request_recipients SET status=CASE WHEN ${input.status === "acknowledged"} THEN CASE WHEN status='registered' THEN 'acknowledged'::request_status ELSE status END ELSE 'on_hold'::request_status END,acknowledged_at=CASE WHEN ${input.status === "acknowledged"} THEN coalesce(acknowledged_at,clock_timestamp()) ELSE acknowledged_at END,updated_at=clock_timestamp() WHERE post_id=${postId} AND representative_id=${representativeId}`;
    const [updated] =
      await tx`SELECT status FROM request_recipients WHERE post_id=${postId} AND representative_id=${representativeId}`;
    return { status: updated.status };
  });
}

export async function employment(
  actor: Viewer,
  input: Record<string, unknown>,
) {
  fields(input, ["employed", "confirmed"]);
  if (actor.role !== "staff")
    throw new ApiError(403, "위임 직원 계정만 확인할 수 있어요.");
  if (
    typeof input.employed !== "boolean" ||
    (!input.employed && input.confirmed !== true)
  )
    throw new ApiError(400, "미재직 확인 시 공식 권한 회수에 동의가 필요해요.");
  return database().begin(async (tx) => {
    const [current] =
      await tx`SELECT role FROM accounts WHERE id=${actor.id} AND disabled_at IS NULL FOR UPDATE`;
    if (!current || current.role !== "staff")
      throw new ApiError(401, "계정 상태를 다시 확인해주세요.");
    if (input.employed)
      await tx`UPDATE official_grants SET employment_confirmed_at=clock_timestamp() WHERE account_id=${actor.id} AND revoked_at IS NULL`;
    else
      await tx`UPDATE official_grants SET revoked_at=clock_timestamp(),revocation_reason='employment_ended' WHERE account_id=${actor.id} AND revoked_at IS NULL`;
    return { confirmed: true, officialRightsRevoked: !input.employed };
  });
}
