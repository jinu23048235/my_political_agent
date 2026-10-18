import { cookies } from "next/headers";
import { dataMode } from "../domain";
import { ApiError, publicError } from "./errors";
import { SESSION_COOKIE, viewerFromToken } from "./sessions";
export async function viewer() {
  return viewerFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function requireViewer() {
  const account = await viewer();
  if (!account) throw new ApiError(401, "로그인이 필요해요.");
  return account;
}
export function sameOrigin(request: Request) {
  const expected = new URL(process.env.APP_ORIGIN ?? request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new ApiError(403, "허용되지 않은 요청 출처예요.");
}
export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ApiError(415, "JSON 형식이 필요해요.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "요청 내용이 없어요.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 65536) {
      await reader.cancel();
      throw new ApiError(413, "요청 내용이 너무 커요.");
    }
    chunks.push(value);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    throw new ApiError(400, "요청 형식을 확인해주세요.");
  }
}
export async function handle(work: () => Promise<unknown>) {
  try {
    return Response.json(await work(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const safe = publicError(error);
    return Response.json(
      { error: safe.message },
      {
        status: safe.status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
export function requireDatabaseMode() {
  if (dataMode(process.env) !== "database")
    throw new ApiError(503, "저장 서비스를 연결하고 있어요.");
}
