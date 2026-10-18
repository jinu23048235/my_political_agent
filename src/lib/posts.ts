import { containsRegion, dataMode, type Post } from "./domain";
export async function listPosts(region: string): Promise<Post[]> {
  if (dataMode(process.env) === "empty") return [];
  const { samplePosts } = await import("./sample-data");
  return samplePosts.filter(post => containsRegion(region, post.regionCode));
}
export async function findPost(id: string): Promise<Post | undefined> {
  return (await listPosts("seoul")).find(post => post.id === id);
}
