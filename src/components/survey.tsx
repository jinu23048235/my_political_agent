"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "./mutations";
export type SurveyData = {
  id: string;
  question: string;
  choices: string[];
  mode: string;
  closesAt: string;
  closed: boolean;
  myChoices: number[] | null;
  canVote: boolean;
  results:
    | { choiceIndex: number; responseCount: number; participantCount: number }[]
    | null;
};
export function Survey({ survey }: { survey: SurveyData }) {
  const router = useRouter();
  const [selected, setSelected] = useState(survey.myChoices ?? []),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="survey">
      <h2>{survey.question}</h2>
      <p className="small">
        {survey.mode === "single" ? "하나 선택" : "여러 개 선택 가능"} ·{" "}
        {new Intl.DateTimeFormat("ko-KR", {
          timeZone: "Asia/Seoul",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(survey.closesAt))}{" "}
        마감 (한국 시간)
      </p>
      {survey.closed ? (
        <>
          <p>총 {survey.results?.[0]?.participantCount ?? 0}명 참여</p>
          {survey.choices.map((choice, index) => (
            <div className="survey-result" key={index}>
              <span>{choice}</span>
              <strong>
                {survey.results?.find((r) => r.choiceIndex === index)
                  ?.responseCount ?? 0}
                표
              </strong>
            </div>
          ))}
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await mutate(`/api/surveys/${survey.id}/response`, "PUT", {
                selectedIndexes: selected,
              });
              setMessage("선택을 저장했어요. 마감 전까지 변경할 수 있어요.");
              router.refresh();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={!survey.canVote || busy}>
            <legend className="sr-only">설문 선택지</legend>
            {survey.choices.map((choice, index) => (
              <label className="setting-row" key={index}>
                <input
                  type={survey.mode === "single" ? "radio" : "checkbox"}
                  name="survey-choice"
                  checked={selected.includes(index)}
                  onChange={(e) =>
                    setSelected((current) =>
                      survey.mode === "single"
                        ? [index]
                        : e.target.checked
                          ? [...current, index]
                          : current.filter((i) => i !== index),
                    )
                  }
                />
                {choice}
              </label>
            ))}
          </fieldset>
          {survey.canVote ? (
            <button className="primary" disabled={busy || !selected.length}>
              {survey.myChoices ? "선택 변경" : "설문 참여"}
            </button>
          ) : (
            <p className="small">해당 지역 인증 시민만 참여할 수 있어요.</p>
          )}
          <p className="small">
            개인별 선택은 공개하지 않아요. 집계 결과는 마감 후 누구나 볼 수
            있어요.
          </p>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
