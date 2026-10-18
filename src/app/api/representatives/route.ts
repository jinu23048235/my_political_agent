import { handle, requireDatabaseMode } from "@/lib/server/http";
import { dbRepresentatives } from "@/lib/server/repository";
export function GET(request: Request) {
  return handle(async () => {
    requireDatabaseMode();
    return {
      representatives: await dbRepresentatives(
        new URL(request.url).searchParams.get("region") ?? "mapo",
      ),
    };
  });
}
