import {
  handle,
  readJson,
  requireViewer,
  requireDatabaseMode,
  sameOrigin,
} from "@/lib/server/http";
import { acknowledge } from "@/lib/server/services";
import { uuid } from "@/lib/server/errors";
export function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; representativeId: string }> },
) {
  return handle(async () => {
    sameOrigin(request);
    const actor = await requireViewer();
    requireDatabaseMode();
    const p = await context.params;
    return acknowledge(
      actor,
      uuid(p.id),
      uuid(p.representativeId),
      await readJson(request),
    );
  });
}
