"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "./mutations";
type Profile = {
  nickname: string;
  role: string;
  preferences: {
    requestAcknowledged: boolean;
    officialAnswer: boolean;
    additionalReply: boolean;
  };
  representativeNotifications: { id: string; name: string; enabled: boolean }[];
};
export function SettingsForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [nickname, setNickname] = useState(profile.nickname),
    [prefs, setPrefs] = useState(profile.preferences),
    [follows, setFollows] = useState(profile.representativeNotifications),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="settings-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        setError("");
        try {
          await mutate("/api/settings", "PATCH", {
            nickname,
            ...prefs,
            representativeNotifications: follows.map(({ id, enabled }) => ({
              id,
              enabled,
            })),
          });
          setMessage("저장했어요.");
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field-label" htmlFor="nickname">
        닉네임
      </label>
      <input
        id="nickname"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        required
      />
      <fieldset>
        <legend>내 요청과 답글 알림</legend>
        {(
          [
            ["requestAcknowledged", "내 요청 접수 확인"],
            ["officialAnswer", "공식 답변"],
            ["additionalReply", "추가 답글"],
          ] as const
        ).map(([key, label]) => (
          <label className="setting-row" key={key}>
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) =>
                setPrefs((current) => ({ ...current, [key]: e.target.checked }))
              }
            />
            {label}
          </label>
        ))}
        <p className="small">
          끄면 서비스 내 알림과 푸시를 모두 받지 않아요. 푸시 수신에는 브라우저
          권한도 필요해요.
        </p>
      </fieldset>
      {follows.length > 0 && (
        <fieldset>
          <legend>팔로우한 대표자 새 글 알림</legend>
          {follows.map((rep) => (
            <label className="setting-row" key={rep.id}>
              <input
                type="checkbox"
                checked={rep.enabled}
                onChange={(e) =>
                  setFollows((current) =>
                    current.map((r) =>
                      r.id === rep.id ? { ...r, enabled: e.target.checked } : r,
                    ),
                  )
                }
              />
              {rep.name}
            </label>
          ))}
        </fieldset>
      )}
      <button className="primary" disabled={busy}>
        설정 저장
      </button>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
