import {
  handle,
  readJson,
  requireViewer,
  requireDatabaseMode,
  sameOrigin,
} from "@/lib/server/http";
import { editPost, deletePost } from "@/lib/server/services";
import { findPost } from "@/lib/posts";
import { ApiError, uuid } from "@/lib/server/errors";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return handle(async () => {
    const p = new URL(request.url).searchParams;
    const post = await findPost(
      (await context.params).id,
      p.get("conversation") ?? undefined,
      p.get("cursor") ?? undefined,
    );
    if (!post) throw new ApiError(404, "이야기를 찾을 수 없어요.");
    return post;
  });
}
export function PATCH(request: Request, context: Context) {
  return handle(async () => {
    sameOrigin(request);
    const actor = await requireViewer();
    requireDatabaseMode();
    return editPost(
      actor,
      uuid((await context.params).id),
      await readJson(request),
    );
  });
}
export function DELETE(request: Request, context: Context) {
  return handle(async () => {
    sameOrigin(request);
    const actor = await requireViewer();
    requireDatabaseMode();
    return deletePost(actor, uuid((await context.params).id));
  });
}
