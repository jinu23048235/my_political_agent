import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorLine, PostCard } from "@/components/post-card";
import {
  Acknowledge,
  ContentActions,
  Empathy,
  PinButton,
  ReplyForm,
} from "@/components/mutations";
import { Survey, type SurveyData } from "@/components/survey";
import { findPost } from "@/lib/posts";
import { viewer } from "@/lib/server/http";
import { database } from "@/lib/server/db";
import { officials } from "@/lib/server/access";
import { surveyView } from "@/lib/server/services";
export const dynamic = "force-dynamic";
export default async function PostDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ conversation?: string; cursor?: string }>;
}) {
  const query = await searchParams;
  const post = await findPost(
    (await params).id,
    query.conversation,
    query.cursor,
  );
  if (!post) notFound();
  const account = await viewer();
  const grants =
    account && (account.role === "staff" || account.role === "representative")
      ? await database().begin((tx) => officials(tx, account, post.regionCode))
      : [];
  const canPin =
    !!account && (account.id === post.author.id || account.role === "operator");
  const parent = post.replies.find((reply) => reply.id === query.conversation);
  const pinned = !parent
    ? post.replies.find((reply) => reply.id === post.pinnedReplyId)
    : undefined;
  const replies = post.replies.filter(
    (reply) =>
      reply.parentId === (parent?.id ?? null) && reply.id !== pinned?.id,
  );
  const show = (reply: (typeof post.replies)[number], pin = false) => (
    <article key={reply.id} className={`reply ${pin ? "pinned-reply" : ""}`}>
      {pin && <p className="pin-label">⌖ 고정 댓글</p>}
      <AuthorLine author={reply.author} time={reply.createdAt} />
      <p className="reply-body">{reply.body}</p>
      {reply.link && (
        <a href={reply.link} target="_blank" rel="noopener noreferrer">
          관련 링크 ↗
        </a>
      )}
      <Link
        className="text-button"
        href={`/posts/${post.id}?conversation=${reply.id}`}
      >
        이어진 답글{" "}
        {(reply.replyCount ?? 0) > 0 ? `${reply.replyCount}개 보기` : "쓰기"} →
      </Link>
      {account && !reply.deleted && (
        <ContentActions
          endpoint={`/api/replies/${reply.id}`}
          body={reply.body}
          canEdit={account.id === reply.author.id}
          canDelete={
            account.id === reply.author.id || account.role === "operator"
          }
        />
      )}
      {canPin && !reply.deleted && (
        <PinButton
          postId={post.id}
          replyId={reply.id}
          pinned={reply.id === post.pinnedReplyId}
        />
      )}
    </article>
  );
  const statuses: Record<string, string> = {
    registered: "등록",
    acknowledged: "의원실 접수 확인",
    answered: "답변 완료",
    on_hold: "답변 보류",
  };
  return (
    <>
      <header className="view-header">
        <Link href={`/?region=${post.regionCode}`} className="back">
          ← 지역 피드
        </Link>
      </header>
      <div className="posts">
        <PostCard post={post} detail />
      </div>
      {account && !post.deleted && (
        <section className="settings-card">
          <ContentActions
            endpoint={`/api/posts/${post.id}`}
            body={post.body}
            canEdit={account.id === post.author.id}
            canDelete={
              account.id === post.author.id || account.role === "operator"
            }
            afterDelete={`/?region=${post.regionCode}`}
          />
          {account.role === "citizen" && <Empathy postId={post.id} />}
        </section>
      )}
      {!!post.recipients?.length && (
        <section className="settings-card">
          <h2>요청을 받은 대표자별 진행 상태</h2>
          <p className="small">
            플랫폼 등록과 의원실의 직접 접수 확인을 구분해요.
          </p>
          {post.recipients.map((rep) => (
            <div className="request-recipient" key={rep.representativeId}>
              <strong>{rep.name}</strong>
              <div className="small">
                {statuses[rep.status]}
                {!rep.joined ? " · 공식 계정 미참여·미전달" : ""}
              </div>
              {grants.some(
                (g) => g.representative_id === rep.representativeId,
              ) && (
                <Acknowledge
                  postId={post.id}
                  representativeId={rep.representativeId}
                />
              )}
            </div>
          ))}
        </section>
      )}
      <section className="replies">
        {post.surveyId && (
          <Survey
            key={post.surveyId}
            survey={
              JSON.parse(
                JSON.stringify(await surveyView(post.surveyId, account)),
              ) as SurveyData
            }
          />
        )}
        <h1 className="section-title">
          답글 {post.replyCount ?? post.replies.length}
        </h1>
        {pinned && show(pinned, true)}
        {parent && (
          <>
            <Link className="text-button" href={`/posts/${post.id}`}>
              ← 전체 대화
            </Link>
            {show(parent)}
          </>
        )}
        {replies.map((reply) => show(reply))}
        {post.nextReplyCursor && (
          <Link
            className="chip"
            href={`/posts/${post.id}?${new URLSearchParams({ ...(parent ? { conversation: parent.id } : {}), cursor: post.nextReplyCursor })}`}
          >
            다음 답글 보기
          </Link>
        )}
        {parent?.deleted ? (
          <div className="notice">공개 답글에서 대화를 이어갈 수 있어요.</div>
        ) : account ? (
          <ReplyForm postId={post.id} parentId={parent?.id} />
        ) : (
          <div className="notice">
            <Link href="/login">로그인</Link>과 지역 인증 후 답글을 남길 수
            있어요.
          </div>
        )}
      </section>
    </>
  );
}
