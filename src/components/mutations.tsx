"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export async function mutate(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "요청을 처리하지 못했어요.");
  return data;
}
export function ContentActions({
  endpoint,
  body,
  canEdit,
  canDelete,
  afterDelete,
}: {
  endpoint: string;
  body: string;
  canEdit: boolean;
  canDelete: boolean;
  afterDelete?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(body),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(method: string) {
    setBusy(true);
    setError("");
    try {
      await mutate(
        endpoint,
        method,
        method === "PATCH" ? { body: draft } : undefined,
      );
      setEditing(false);
      if (method === "DELETE" && afterDelete) router.push(afterDelete);
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-actions">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act("PATCH");
          }}
        >
          <label className="sr-only" htmlFor={`edit-${endpoint}`}>
            내용 수정
          </label>
          <textarea
            id={`edit-${endpoint}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            required
          />
          <div className="counter">{[...draft].length} / 2,000</div>
          <button className="chip" disabled={busy}>
            수정 저장
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setEditing(false)}
          >
            취소
          </button>
        </form>
      ) : (
        <>
          {canEdit && (
            <button className="text-button" onClick={() => setEditing(true)}>
              수정
            </button>
          )}
          {canDelete && (
            <button
              className="text-button danger"
              disabled={busy}
              onClick={() => {
                if (confirm("내용을 삭제할까요?")) void act("DELETE");
              }}
            >
              삭제
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
export function PinButton({
  postId,
  replyId,
  pinned,
}: {
  postId: string;
  replyId: string;
  pinned: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="text-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await mutate(`/api/posts/${postId}/pin`, "PUT", {
              replyId: pinned ? null : replyId,
            });
            setError("");
            router.refresh();
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {pinned ? "고정 해제" : "댓글 고정"}
      </button>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </>
  );
}
export function ReplyForm({
  postId,
  parentId = null,
}: {
  postId: string;
  parentId?: string | null;
}) {
  const router = useRouter();
  const [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="reply"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await mutate(`/api/posts/${postId}/replies`, "POST", {
            body,
            parentId,
          });
          setBody("");
          setError("");
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field-label" htmlFor="reply-body">
        {parentId ? "이 답글에 이어 쓰기" : "답글 남기기"}
      </label>
      <textarea
        id="reply-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <div className="counter">{[...body].length} / 2,000</div>
      <button className="primary" disabled={busy || [...body].length > 2000}>
        답글 등록
      </button>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </form>
  );
}
export function EmploymentCheck() {
  const router = useRouter();
  const [error, setError] = useState("");
  async function submit(employed: boolean) {
    if (
      !employed &&
      !confirm("공식 권한과 인증 표시가 회수됩니다. 계속할까요?")
    )
      return;
    try {
      await mutate("/api/account/employment", "POST", {
        employed,
        confirmed: !employed,
      });
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <section className="settings-card">
      <h1>재직·위임 상태를 확인해주세요</h1>
      <p>계속 이용하려면 현재도 재직 중이며 위임받고 있는지 확인이 필요해요.</p>
      <div className="region-options">
        <button className="primary" onClick={() => submit(true)}>
          재직·위임 중이에요
        </button>
        <button className="chip" onClick={() => submit(false)}>
          종료되었어요
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function Logout() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="text-button"
        onClick={async () => {
          try {
            await mutate("/api/logout", "POST");
            router.refresh();
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        로그아웃
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
export function Empathy({ postId }: { postId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="chip"
        onClick={async () => {
          try {
            await mutate(`/api/posts/${postId}/empathy`, "POST");
            setError("");
            router.refresh();
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        공감하기
      </button>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </>
  );
}
export function Acknowledge({
  postId,
  representativeId,
}: {
  postId: string;
  representativeId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  async function send(status: string) {
    try {
      await mutate(
        `/api/posts/${postId}/recipients/${representativeId}`,
        "PATCH",
        { status },
      );
      setError("");
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <>
      <div className="region-options">
        <button className="chip" onClick={() => send("acknowledged")}>
          접수 확인
        </button>
        <button className="chip" onClick={() => send("on_hold")}>
          답변 보류
        </button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </>
  );
}
