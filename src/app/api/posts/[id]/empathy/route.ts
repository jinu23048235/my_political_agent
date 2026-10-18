import {
  handle,
  readJson,
  requireViewer,
  requireDatabaseMode,
  sameOrigin,
} from "@/lib/server/http";
import { empathy } from "@/lib/server/services";
import { uuid } from "@/lib/server/errors";
export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    sameOrigin(request);
    const actor = await requireViewer();
    requireDatabaseMode();
    return empathy(actor, uuid((await context.params).id));
  });
}
