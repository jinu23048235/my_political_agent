import {
  containsRegion,
  dataMode,
  regions,
  type Post,
  type Region,
} from "./domain";
import { dbFindPost, dbListPosts, dbRegions } from "./server/repository";
export async function listRegions(): Promise<Region[]> {
  return dataMode(process.env) === "database" ? dbRegions() : regions;
}
export async function listPosts(
  region: string,
  sort = "latest",
): Promise<Post[]> {
  const mode = dataMode(process.env);
  if (mode === "empty") return [];
  if (mode === "database") return dbListPosts(region, sort);
  const { samplePosts } = await import("./sample-data");
  return samplePosts.filter((post) => containsRegion(region, post.regionCode));
}
export async function findPost(
  id: string,
  conversation?: string,
  cursor?: string,
): Promise<Post | undefined> {
  if (dataMode(process.env) === "database") {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      return undefined;
    for (const candidate of [conversation, cursor])
      if (
        candidate &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          candidate,
        )
      )
        return undefined;
    return dbFindPost(id, conversation, cursor);
  }
  return (await listPosts("seoul")).find((post) => post.id === id);
}
