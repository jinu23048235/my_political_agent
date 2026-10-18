import {
  handle,
  readJson,
  requireViewer,
  requireDatabaseMode,
  sameOrigin,
} from "@/lib/server/http";
import { changeReply } from "@/lib/server/services";
import { uuid } from "@/lib/server/errors";
type Context = { params: Promise<{ id: string }> };
export function PATCH(request: Request, context: Context) {
  return handle(async () => {
    sameOrigin(request);
    const actor = await requireViewer();
    requireDatabaseMode();
    return changeReply(
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
    return changeReply(actor, uuid((await context.params).id), null);
  });
}
