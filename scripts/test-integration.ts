import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import postgres from "postgres";
import { migrate } from "./migrate";
const target = process.env.DB_TEST_URL;
if (
  !target ||
  !new URL(target).pathname.endsWith("_test") ||
  target === process.env.DATABASE_URL
)
  throw new Error("Use a separate disposable DB_TEST_URL ending in _test.");
const admin = postgres(target, { max: 1, onnotice: () => {} });
const schema = "api_test_" + randomUUID().replaceAll("-", "");
const scoped = new URL(target);
scoped.searchParams.set("options", `-csearch_path=${schema},public`);
const url = scoped.href;
const port = process.env.TEST_PORT ?? "3117",
  origin = `http://127.0.0.1:${port}`;
let server: ChildProcess | undefined;
let sql: ReturnType<typeof postgres> | undefined;
let appDb: ReturnType<typeof postgres> | undefined;
let checks = 0;
try {
  await admin`CREATE EXTENSION IF NOT EXISTS postgis`;
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = postgres(url, { max: 2, onnotice: () => {} });
  // Shadow the public migration ledger so this schema gets a complete fresh migration.
  await sql`CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`;
  await migrate(url);
  process.env.DATABASE_URL = url;
  process.env.APP_DATA_MODE = "database";
  const { issueVerifiedSession, sessionHash } =
    await import("../src/lib/server/sessions");
  const { database } = await import("../src/lib/server/db");
  appDb = database();
  const ids = {
    a: randomUUID(),
    b: randomUUID(),
    staff: randomUUID(),
    operator: randomUUID(),
    rep: randomUUID(),
    unjoined: randomUUID(),
    term: randomUUID(),
    grant: randomUUID(),
  };
  await sql`INSERT INTO regions(code,name,parent_code) VALUES ('seoul','서울특별시',NULL),('mapo','마포구','seoul'),('seongsan1','성산1동','mapo'),('mangwon1','망원1동','mapo')`;
  await sql`INSERT INTO accounts(id,role,nickname) VALUES (${ids.a},'citizen','성산주민'),(${ids.b},'citizen','망원주민'),(${ids.staff},'staff','의원실'),(${ids.operator},'operator','운영자')`;
  await sql`INSERT INTO region_certifications(account_id,slot,region_code,verified_at,expires_at) VALUES (${ids.a},1,'seongsan1',now(),now()+interval '1 year'),(${ids.b},1,'mangwon1',now(),now()+interval '1 year')`;
  await sql`INSERT INTO representatives(id,name,office,region_code) VALUES (${ids.rep},'대표가','구의원','mapo'),(${ids.unjoined},'대표나','시의원','seoul')`;
  await sql`INSERT INTO representative_terms(id,representative_id,starts_at,ends_at) VALUES (${ids.term},${ids.rep},now()-interval '1 year',now()+interval '1 year')`;
  await sql`INSERT INTO official_grants(id,account_id,representative_id,term_id,reviewed_by,employment_confirmed_at) VALUES (${ids.grant},${ids.staff},${ids.rep},${ids.term},${ids.operator},now())`;
  await sql`INSERT INTO follows(account_id,representative_id) VALUES (${ids.a},${ids.rep})`;
  const tokens = {
    a: (await issueVerifiedSession(ids.a)).token,
    b: (await issueVerifiedSession(ids.b)).token,
    staff: (await issueVerifiedSession(ids.staff)).token,
    operator: (await issueVerifiedSession(ids.operator)).token,
  };
  assert.equal(
    (await sql`SELECT token_hash FROM sessions WHERE account_id=${ids.a}`)[0]
      .token_hash,
    sessionHash(tokens.a),
  );
  checks++;
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      port,
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: url,
        APP_DATA_MODE: "database",
        APP_ORIGIN: origin,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let serverError = "";
  server.stderr?.on("data", (chunk) => {
    serverError += String(chunk).slice(0, 1000);
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/api/health")).ok) break;
    } catch {}
    if (i === 99 || server.exitCode !== null)
      throw new Error("Test server failed to start: " + serverError);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  type User = keyof typeof tokens;
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    user?: User,
    expected = 200,
    requestOrigin: string | null = origin,
  ) {
    const headers: Record<string, string> = {};
    if (requestOrigin) headers.Origin = requestOrigin;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (user) headers.Cookie = `neighborhood_session=${tokens[user]}`;
    const response = await fetch(origin + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(
      response.status,
      expected,
      `${method} ${path}: ${JSON.stringify(data)}`,
    );
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    checks++;
    return data;
  }
  const story = {
    regionCode: "seongsan1",
    kind: "story",
    body: "함께 나누는 동네 이야기",
  };
  await call("/api/posts", "POST", story, undefined, 401);
  await call("/api/posts", "POST", story, "a", 403, "https://other.example");
  await call("/api/posts", "POST", story, "a", 403, null);
  await call("/api/posts", "POST", { ...story, authorId: ids.b }, "a", 400);
  await call("/api/posts", "POST", { ...story, kind: "opinion" }, "a", 403);
  await call(
    "/api/posts",
    "POST",
    { ...story, regionCode: "mangwon1" },
    "a",
    403,
  );
  await call(
    "/api/posts",
    "POST",
    { ...story, body: "😀".repeat(2001) },
    "a",
    400,
  );
  await call(
    "/api/posts",
    "POST",
    { ...story, link: "javascript:alert(1)" },
    "a",
    400,
  );
  const post = await call("/api/posts", "POST", story, "a");
  const other = await call(
    "/api/posts",
    "POST",
    { ...story, body: "다른 글" },
    "a",
  );
  await call(`/api/posts/${post.id}`, "PATCH", { body: "가로채기" }, "b", 403);
  await call(`/api/posts/${post.id}`, "PATCH", { body: "수정한 본문" }, "a");
  await call(`/api/posts/${post.id}/empathy`, "POST", undefined, "b", 403);
  assert.equal(
    (await call(`/api/posts/${post.id}/empathy`, "POST", undefined, "a")).count,
    1,
  );
  assert.equal(
    (await call(`/api/posts/${post.id}/empathy`, "POST", undefined, "a")).count,
    1,
  );
  const r1 = await call(
    `/api/posts/${post.id}/replies`,
    "POST",
    { body: "첫 댓글" },
    "a",
  );
  const r2 = await call(
    `/api/posts/${post.id}/replies`,
    "POST",
    { body: "이어진 댓글", parentId: r1.id },
    "a",
  );
  const wrong = await call(
    `/api/posts/${other.id}/replies`,
    "POST",
    { body: "다른 글 댓글" },
    "a",
  );
  await call(`/api/posts/${post.id}/pin`, "PUT", { replyId: r1.id }, "b", 403);
  await call(
    `/api/posts/${post.id}/pin`,
    "PUT",
    { replyId: wrong.id },
    "a",
    400,
  );
  await call(
    `/api/posts/${post.id}/pin`,
    "PUT",
    { replyId: r1.id },
    "operator",
  );
  await call(`/api/posts/${post.id}/pin`, "PUT", { replyId: null }, "operator");
  await call(`/api/posts/${post.id}/pin`, "PUT", { replyId: r1.id }, "a");
  await call(`/api/posts/${post.id}/pin`, "PUT", { replyId: r2.id }, "a");
  assert.equal((await call(`/api/posts/${post.id}`)).pinnedReplyId, r2.id);
  await call(`/api/replies/${r2.id}`, "DELETE", undefined, "a");
  assert.equal((await call(`/api/posts/${post.id}`)).pinnedReplyId, null);
  const r3 = await call(
    `/api/posts/${post.id}/replies`,
    "POST",
    { body: "남겨질 대화", parentId: r1.id },
    "a",
  );
  const r4 = await call(
    `/api/posts/${post.id}/replies`,
    "POST",
    { body: "깊은 대화", parentId: r3.id },
    "a",
  );
  await call(`/api/replies/${r1.id}`, "DELETE", undefined, "a");
  await call(`/api/replies/${r3.id}`, "DELETE", undefined, "a");
  assert.equal(
    (await call(`/api/posts/${post.id}`)).replies.some(
      (r: { id: string }) => r.id === r1.id,
    ),
    true,
  );
  assert.equal(
    (await call(`/api/posts/${post.id}?conversation=${r3.id}`)).replies.some(
      (r: { id: string }) => r.id === r4.id,
    ),
    true,
  );
  assert.equal(
    (await call(`/api/posts/${post.id}?conversation=${r1.id}`)).replies.some(
      (r: { id: string }) => r.id === r3.id,
    ),
    true,
  );
  const request = await call(
    "/api/posts",
    "POST",
    { ...story, kind: "request", recipientIds: [ids.rep, ids.unjoined] },
    "a",
  );
  assert.equal(
    (await call(`/api/posts/${request.id}`)).recipients.find(
      (r: { representativeId: string }) => r.representativeId === ids.unjoined,
    ).joined,
    false,
  );
  const recipient = `/api/posts/${request.id}/recipients/${ids.rep}`;
  await call(recipient, "PATCH", { status: "acknowledged" }, "a", 403);
  await call(recipient, "PATCH", { status: "on_hold" }, "staff", 409);
  await call(recipient, "PATCH", { status: "acknowledged" }, "staff");
  const answer = await call(
    `/api/posts/${request.id}/replies`,
    "POST",
    { body: "공식 답변" },
    "staff",
  );
  assert.equal(
    (await call(`/api/posts/${request.id}`)).recipients.find(
      (r: { representativeId: string }) => r.representativeId === ids.rep,
    ).status,
    "answered",
  );
  await call(`/api/posts/${request.id}`, "DELETE", undefined, "a");
  assert.equal((await call(`/api/posts/${request.id}`)).body, "삭제된 요청");
  await call(`/api/replies/${answer.id}`, "DELETE", undefined, "staff");
  const statuses =
    await sql`SELECT representative_id,status FROM request_recipients WHERE post_id=${request.id}`;
  assert.equal(
    statuses.find((r) => r.representative_id === ids.rep)?.status,
    "on_hold",
  );
  assert.equal(
    statuses.find((r) => r.representative_id === ids.unjoined)?.status,
    "registered",
  );
  checks++;
  const poll = await call(
    "/api/posts",
    "POST",
    {
      regionCode: "mapo",
      kind: "opinion",
      body: "의견을 주세요",
      survey: {
        question: "어떤 시간이 좋나요?",
        choices: ["평일", "주말"],
        mode: "multiple",
        closesAt: new Date(Date.now() + 60000).toISOString(),
      },
    },
    "staff",
  );
  const surveyId = (await call(`/api/posts/${poll.id}`)).surveyId;
  await call(
    `/api/posts/${poll.id}`,
    "PATCH",
    { body: "본문 변경", survey: { question: "바꾸기" } },
    "staff",
    400,
  );
  await call(
    `/api/posts/${poll.id}`,
    "PATCH",
    { body: "본문은 수정 가능" },
    "staff",
  );
  await call(
    `/api/surveys/${surveyId}/response`,
    "PUT",
    { selectedIndexes: [0] },
    "staff",
    409,
  );
  await call(
    `/api/surveys/${surveyId}/response`,
    "PUT",
    { selectedIndexes: [0] },
    "a",
  );
  await call(
    `/api/surveys/${surveyId}/response`,
    "PUT",
    { selectedIndexes: [1] },
    "a",
  );
  await call(
    `/api/surveys/${surveyId}/response`,
    "PUT",
    { selectedIndexes: [0, 1] },
    "b",
  );
  const aView = await call(`/api/surveys/${surveyId}`, "GET", undefined, "a");
  assert.deepEqual(aView.myChoices, [1]);
  assert.equal(aView.results, null);
  const guestView = await call(`/api/surveys/${surveyId}`);
  assert.equal(guestView.myChoices, null);
  assert.equal(guestView.results, null);
  assert.equal(
    (
      await sql`SELECT count(*)::int AS n FROM survey_responses WHERE survey_id=${surveyId}`
    )[0].n,
    2,
  );
  checks++;
  // A short separate survey exercises real clock expiry without changing an immutable definition.
  const closing = await call(
    "/api/posts",
    "POST",
    {
      regionCode: "mapo",
      kind: "opinion",
      body: "마감 검증",
      survey: {
        question: "하나 골라주세요",
        choices: ["가", "나"],
        mode: "single",
        closesAt: new Date(Date.now() + 2000).toISOString(),
      },
    },
    "staff",
  );
  const closingId = (await call(`/api/posts/${closing.id}`)).surveyId;
  await call(
    `/api/surveys/${closingId}/response`,
    "PUT",
    { selectedIndexes: [0] },
    "a",
  );
  await new Promise((resolve) => setTimeout(resolve, 2100));
  const publicResults = await call(`/api/surveys/${closingId}`);
  assert.equal(publicResults.closed, true);
  assert.equal(publicResults.results[0].responseCount, 1);
  assert.equal(publicResults.results[0].participantCount, 1);
  assert.equal(publicResults.myChoices, null);
  await call(
    `/api/surveys/${closingId}/response`,
    "PUT",
    { selectedIndexes: [1] },
    "a",
    409,
  );
  await call("/api/settings", "PATCH", { role: "operator" }, "a", 400);
  await call(
    "/api/settings",
    "PATCH",
    {
      nickname: "새닉네임",
      officialAnswer: false,
      representativeNotifications: [{ id: ids.rep, enabled: false }],
    },
    "a",
  );
  const prefs = await call("/api/settings", "GET", undefined, "a");
  assert.equal(prefs.nickname, "새닉네임");
  assert.equal(prefs.preferences.officialAnswer, false);
  assert.equal(prefs.representativeNotifications[0].enabled, false);
  if (process.env.BROWSER_CHECK === "1") {
    const browser = spawn("python3", ["tests/browser.py"], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    browser.stdin.end(
      JSON.stringify({
        origin,
        tokens,
        postId: post.id,
        surveyPostId: poll.id,
      }),
    );
    const [code] = await once(browser, "exit");
    assert.equal(code, 0, "Browser checks failed");
  }
  await sql`UPDATE region_certifications SET verified_at=now()-interval '2 years',expires_at=(now()-interval '2 years')+interval '1 year' WHERE account_id=${ids.b}`;
  await call("/api/posts", "POST", { ...story, regionCode: "mapo" }, "b", 403);
  await sql`UPDATE official_grants SET employment_confirmed_at=now()-interval '4 months' WHERE id=${ids.grant}`;
  assert.equal(
    (await call("/api/session", "GET", undefined, "staff")).viewer
      .staffCheckRequired,
    true,
  );
  await call(
    "/api/posts",
    "POST",
    { regionCode: "mapo", kind: "explanation", body: "차단되어야 함" },
    "staff",
    403,
  );
  await call("/api/account/employment", "POST", { employed: true }, "staff");
  await call(
    "/api/posts",
    "POST",
    { regionCode: "mapo", kind: "explanation", body: "재확인 후 작성" },
    "staff",
  );
  await call(
    "/api/account/employment",
    "POST",
    { employed: false },
    "staff",
    400,
  );
  await call(
    "/api/account/employment",
    "POST",
    { employed: false, confirmed: true },
    "staff",
  );
  await call("/api/account/employment", "POST", { employed: true }, "staff");
  await call(
    "/api/posts",
    "POST",
    { regionCode: "mapo", kind: "explanation", body: "회수 권한 복구 불가" },
    "staff",
    403,
  );
  await sql`UPDATE accounts SET role='citizen',nickname='퇴직후' WHERE id=${ids.staff}`;
  await call("/api/settings", "GET", undefined, "staff", 401);
  assert.equal(
    (
      await sql`SELECT count(*)::int AS n FROM account_role_history WHERE account_id=${ids.staff}`
    )[0].n,
    1,
  );
  checks++;
  await call("/api/logout", "POST", undefined, "a");
  await call("/api/settings", "GET", undefined, "a", 401);
  const fake = await fetch(origin + "/api/settings", {
    headers: { Cookie: "neighborhood_session=" + "A".repeat(43) },
  });
  assert.equal(fake.status, 401);
  checks++;
  for (const path of [
    "/?region=mapo",
    "/write",
    "/settings",
    `/posts/${post.id}`,
    "/login",
  ]) {
    assert.equal((await fetch(origin + path)).status, 200);
    checks++;
  }
  console.log(
    `PASS: ${checks} HTTP/session/database checks, including privacy and current permissions.`,
  );
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      once(server, "exit"),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  await appDb?.end({ timeout: 2 });
  await sql?.end({ timeout: 2 });
  await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end({ timeout: 2 });
}
