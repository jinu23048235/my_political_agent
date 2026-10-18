"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Region, Role } from "@/lib/domain";
import { mutate } from "./mutations";
type Representative = {
  id: string;
  name: string;
  office: string;
  joined: boolean;
};
export function Compose({ regions, role }: { regions: Region[]; role: Role }) {
  const router = useRouter();
  const [region, setRegion] = useState(
      regions.find((r) => r.code === "mapo")?.code ?? regions[0]?.code ?? "",
    ),
    [kind, setKind] = useState(role === "citizen" ? "story" : "explanation"),
    [body, setBody] = useState(""),
    [link, setLink] = useState(""),
    [recipients, setRecipients] = useState<string[]>([]),
    [representatives, setRepresentatives] = useState<Representative[]>([]),
    [poll, setPoll] = useState(false),
    [question, setQuestion] = useState(""),
    [choices, setChoices] = useState(["", ""]),
    [mode, setMode] = useState("single"),
    [closes, setCloses] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setRecipients([]);
    setRepresentatives([]);
    fetch(`/api/representatives?region=${encodeURIComponent(region)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (response.ok) setRepresentatives(data.representatives);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [region]);
  return (
    <form
      className="settings-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const payload: Record<string, unknown> = {
            regionCode: region,
            kind,
            body,
            link,
          };
          if (kind === "request") payload.recipientIds = recipients;
          if (kind === "opinion" && poll)
            payload.survey = {
              question,
              choices,
              mode,
              closesAt: new Date(closes + "+09:00").toISOString(),
            };
          const result = await mutate("/api/posts", "POST", payload);
          router.push(`/posts/${result.id}`);
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="notice">
        공개되는 이야기예요. 연락처·주소 등 개인정보를 적지 않도록 주의해주세요.
      </div>
      <label className="field-label" htmlFor="region">
        지역
      </label>
      <select
        id="region"
        value={region}
        onChange={(e) => setRegion(e.target.value)}
      >
        {regions.map((r) => (
          <option key={r.code} value={r.code}>
            {r.name}
          </option>
        ))}
      </select>
      <label className="field-label" htmlFor="kind">
        이야기 유형
      </label>
      <select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
        {(role === "citizen"
          ? [
              ["story", "동네 이야기"],
              ["request", "시민 요청"],
            ]
          : [
              ["explanation", "현안 설명"],
              ["opinion", "주민 의견 요청"],
              ["progress", "진행 경과 보고"],
            ]
        ).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label className="field-label" htmlFor="post-body">
        이야기
      </label>
      <textarea
        id="post-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <div className="counter">{[...body].length} / 2,000</div>
      <label className="field-label" htmlFor="post-link">
        외부 링크 · 선택
      </label>
      <input
        id="post-link"
        type="url"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https://"
      />
      {kind === "request" && (
        <fieldset>
          <legend>요청할 대표자 · 여러 명 선택 가능</legend>
          {representatives.length ? (
            representatives.map((rep) => (
              <label className="setting-row" key={rep.id}>
                <input
                  type="checkbox"
                  checked={recipients.includes(rep.id)}
                  onChange={(e) =>
                    setRecipients((current) =>
                      e.target.checked
                        ? [...current, rep.id]
                        : current.filter((id) => id !== rep.id),
                    )
                  }
                />
                <span>
                  {rep.name}
                  <small>
                    {rep.office} ·{" "}
                    {rep.joined ? "공식 계정 참여" : "공식 계정 미참여·미전달"}
                  </small>
                </span>
              </label>
            ))
          ) : (
            <p className="small">이 지역의 대표자 정보를 준비하고 있어요.</p>
          )}
        </fieldset>
      )}
      {kind === "opinion" && (
        <fieldset>
          <legend>
            <label>
              <input
                type="checkbox"
                checked={poll}
                onChange={(e) => setPoll(e.target.checked)}
              />{" "}
              선택형 설문 추가
            </label>
          </legend>
          {poll && (
            <>
              <label className="field-label" htmlFor="survey-question">
                질문
              </label>
              <input
                id="survey-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                required
              />
              {choices.map((value, index) => (
                <div className="choice-row" key={index}>
                  <label className="sr-only" htmlFor={`choice-${index}`}>
                    선택지 {index + 1}
                  </label>
                  <input
                    id={`choice-${index}`}
                    value={value}
                    onChange={(e) =>
                      setChoices((values) =>
                        values.map((v, i) =>
                          i === index ? e.target.value : v,
                        ),
                      )
                    }
                    required
                    placeholder={`선택지 ${index + 1}`}
                  />
                  <button
                    className="chip"
                    type="button"
                    disabled={choices.length <= 2}
                    onClick={() =>
                      setChoices((values) =>
                        values.filter((_, i) => i !== index),
                      )
                    }
                    aria-label={`선택지 ${index + 1} 삭제`}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                className="text-button"
                type="button"
                onClick={() => setChoices((values) => [...values, ""])}
              >
                ＋ 선택지 추가
              </button>
              <label className="field-label" htmlFor="mode">
                선택 방식
              </label>
              <select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="single">단일 선택</option>
                <option value="multiple">복수 선택</option>
              </select>
              <label className="field-label" htmlFor="closes">
                마감 시각 · 한국 시간
              </label>
              <input
                id="closes"
                type="datetime-local"
                required
                value={closes}
                onChange={(e) => setCloses(e.target.value)}
              />
              <p className="small">
                게시 후 설문은 수정할 수 없어요. 본문만 수정할 수 있어요.
              </p>
            </>
          )}
        </fieldset>
      )}
      <div className="form-footer">
        <button className="primary" disabled={busy || [...body].length > 2000}>
          이야기 등록
        </button>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
