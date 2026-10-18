import {
  handle,
  readJson,
  requireViewer,
  requireDatabaseMode,
  sameOrigin,
} from "@/lib/server/http";
import { createPost } from "@/lib/server/services";
import { listPosts } from "@/lib/posts";
export function GET(request: Request) {
  return handle(async () => {
    const params = new URL(request.url).searchParams;
    return {
      posts: await listPosts(
        params.get("region") ?? "mapo",
        params.get("sort") ?? "latest",
      ),
    };
  });
}
export function POST(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const actor = await requireViewer();
    requireDatabaseMode();
    return createPost(actor, await readJson(request));
  });
}
