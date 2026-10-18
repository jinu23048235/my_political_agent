import { handle, viewer, requireDatabaseMode } from "@/lib/server/http";
import { surveyView } from "@/lib/server/services";
import { uuid } from "@/lib/server/errors";
export function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    requireDatabaseMode();
    return surveyView(uuid((await context.params).id), await viewer());
  });
}
