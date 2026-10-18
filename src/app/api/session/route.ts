import { handle, viewer } from "@/lib/server/http";
export function GET() {
  return handle(async () => ({ viewer: await viewer() }));
}
