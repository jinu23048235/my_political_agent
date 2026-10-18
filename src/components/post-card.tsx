import Link from "next/link";
import { formatTime, regions, type Author, type Post } from "@/lib/domain";
export function AuthorLine({ author, time }: { author: Author; time: string }) {
  const official = author.role === "representative" || author.role === "staff";
  return <div className="author-row"><span className={`avatar ${official ? "official" : ""}`}>{author.name[0]}</span><div><strong className="author-name">{author.name}</strong>{official && <div className="verification">✓ {author.affiliation} · {author.role === "staff" ? "위임 직원" : "본인"} 인증</div>}<div className="small">{formatTime(time)}</div></div></div>;
}
export function PostCard({ post, detail = false }: { post: Post; detail?: boolean }) {
  return <article className="post"><AuthorLine author={post.author} time={post.createdAt}/><div className="tag-line"><span className="pill neutral">{{ story: "동네 이야기", request: "시민 요청", opinion: "주민 의견 요청", explanation: "현안 설명", progress: "진행 경과 보고" }[post.kind]}</span><Link className="tag" href={`/?region=${post.regionCode}`}>#{regions.find(region => region.code === post.regionCode)?.name}</Link></div><p className="post-content">{detail ? post.body : post.body.split("\n\n")[0]}</p>{!detail && post.body.includes("\n\n") && <Link className="text-button" href={`/posts/${post.id}`}>더 보기</Link>}{post.editedAt && <p className="small">수정됨 · {formatTime(post.editedAt)}</p>}<div className="actions"><span>♡ 공감 {post.empathy}</span><Link href={`/posts/${post.id}`}>답글 {post.replies.length}</Link>{!detail && <Link className="end" href={`/posts/${post.id}`}>이야기 보기 ↗</Link>}</div></article>;
}
