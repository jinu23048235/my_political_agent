import Link from "next/link";
import { PostCard } from "@/components/post-card";
import type { Region } from "@/lib/domain";
import { listPosts, listRegions } from "@/lib/posts";
export const dynamic = "force-dynamic";
export default async function Feed({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const regions = await listRegions();
  const region =
    regions.find((region) => region.code === params.region) ??
    regions.find((region) => region.code === "mapo") ??
    regions[0];
  if (!region)
    return (
      <section className="settings-card">
        <h1>지역 피드</h1>
        <p>지역 정보를 준비하고 있어요.</p>
      </section>
    );
  const posts = await listPosts(region.code, params.sort);
  const sort = params.sort === "empathy" ? "empathy" : "latest";
  posts.sort((a, b) =>
    sort === "empathy"
      ? b.empathy - a.empathy
      : Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const path: Region[] = [];
  const seen = new Set<string>();
  for (
    let current: Region | undefined = region;
    current && !seen.has(current.code);
    current = regions.find((r) => r.code === current!.parentCode)
  ) {
    seen.add(current.code);
    path.unshift(current);
  }
  return (
    <>
      <h1 className="sr-only">지역 피드</h1>
      <section className="region-block" aria-label="지역 탐색">
        <nav className="breadcrumb" aria-label="지역 경로">
          {path.map((parent) => (
            <Link
              key={parent.code}
              href={`/?region=${parent.code}`}
              aria-current={
                parent.code === region.code ? "location" : undefined
              }
            >
              {parent.name} {parent.code !== region.code && "›"}
            </Link>
          ))}
        </nav>
        <div className="region-bottom">
          <strong>이 동네에서 나누는 이야기</strong>
        </div>
        <div className="region-options">
          {regions
            .filter((child) => child.parentCode === region.code)
            .map((child) => (
              <Link
                className="chip"
                key={child.code}
                href={`/?region=${child.code}`}
              >
                {child.name} ↗
              </Link>
            ))}
        </div>
      </section>
      <div className="feed-controls">
        <strong>
          {region.name} · {posts.length}개의 이야기
        </strong>
        <nav className="segmented" aria-label="정렬">
          {["latest", "empathy"].map((value) => (
            <Link
              key={value}
              href={`/?region=${region.code}&sort=${value}`}
              className={sort === value ? "selected" : ""}
              aria-current={sort === value ? "true" : undefined}
            >
              {value === "latest" ? "최신순" : "공감순"}
            </Link>
          ))}
        </nav>
      </div>
      <div className="posts">
        {posts.length ? (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        ) : (
          <p className="empty">아직 등록된 이야기가 없어요.</p>
        )}
      </div>
    </>
  );
}
