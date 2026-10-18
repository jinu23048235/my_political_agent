import Link from "next/link";
import { viewer } from "@/lib/server/http";
import { settings } from "@/lib/server/services";
import { SettingsForm } from "@/components/settings-form";
import { Logout } from "@/components/mutations";
export const metadata = { title: "설정" };
export const dynamic = "force-dynamic";
const roles = {
  citizen: "시민",
  representative: "대표자",
  staff: "위임 직원",
  operator: "운영자",
};
export default async function Settings() {
  const account = await viewer();
  return (
    <>
      <header className="view-header">
        <h1>설정</h1>
      </header>
      {account ? (
        <>
          <section className="settings-card">
            <h2>{account.nickname}</h2>
            <p>현재 활동 역할 · {roles[account.role]}</p>
            <Logout />
          </section>
          <SettingsForm profile={await settings(account)} />
        </>
      ) : (
        <section className="settings-card">
          <h2>내 프로필과 알림</h2>
          <p>로그인 후 개인설정을 관리할 수 있어요.</p>
          <Link className="primary" href="/login">
            로그인
          </Link>
        </section>
      )}
    </>
  );
}
