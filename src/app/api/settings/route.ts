import {
  handle,
  readJson,
  requireViewer,
  requireDatabaseMode,
  sameOrigin,
} from "@/lib/server/http";
import { settings } from "@/lib/server/services";
export function GET() {
  return handle(async () => {
    const actor = await requireViewer();
    requireDatabaseMode();
    return settings(actor);
  });
}
export function PATCH(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const actor = await requireViewer();
    requireDatabaseMode();
    return settings(actor, await readJson(request));
  });
}
