import {
  handle,
  readJson,
  requireViewer,
  requireDatabaseMode,
  sameOrigin,
} from "@/lib/server/http";
import { vote } from "@/lib/server/services";
import { uuid } from "@/lib/server/errors";
export function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    sameOrigin(request);
    const actor = await requireViewer();
    requireDatabaseMode();
    return vote(
      actor,
      uuid((await context.params).id),
      await readJson(request),
    );
  });
}
