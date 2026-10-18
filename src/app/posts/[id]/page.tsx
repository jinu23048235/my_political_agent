import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorLine, PostCard } from "@/components/post-card";
import { findPost } from "@/lib/posts";
export const dynamic = "force-dynamic";
export default async function PostDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ conversation?: string }> }) {
  const post = await findPost((await params).id);
  if (!post) notFound();
  const conversation = (await searchParams).conversation;
  const parent = post.replies.find(reply => reply.id === conversation);
  const pinned = !parent ? post.replies.find(reply => reply.id === post.pinnedReplyId) : undefined;
  const replies = post.replies.filter(reply => reply.parentId === (parent?.id ?? null) && reply.id !== pinned?.id);
  const show = (reply: typeof post.replies[number], pin = false) => <article key={reply.id} className={`reply ${pin ? "pinned-reply" : ""}`}>{pin && <p className="pin-label">⌖ 고정 댓글</p>}<AuthorLine author={reply.author} time={reply.createdAt}/><p className="reply-body">{reply.body}</p>{post.replies.some(child => child.parentId === reply.id) && <Link className="text-button" href={`/posts/${post.id}?conversation=${reply.id}`}>이어진 답글 보기 →</Link>}</article>;
  return <><header className="view-header"><Link href={`/?region=${post.regionCode}`} className="back">← 지역 피드</Link></header><div className="posts"><PostCard post={post} detail/></div><section className="replies"><h1 className="section-title">답글 {post.replies.length}</h1>{pinned && show(pinned, true)}{parent && <><Link className="text-button" href={`/posts/${post.id}`}>← 전체 대화</Link>{show(parent)}</>}{replies.map(reply => show(reply))}<div className="notice">로그인과 지역 인증 후 답글을 남길 수 있어요.</div></section></>;
}
