import Link from "next/link";
import { viewer } from "@/lib/server/http";
import { listRegions } from "@/lib/posts";
import { Compose } from "@/components/compose";
export const metadata = { title: "이야기 쓰기" };
export const dynamic = "force-dynamic";
export default async function Write() {
  const account = await viewer();
  return (
    <>
      <header className="view-header">
        <Link className="back" href="/">
          ← 지역 피드
        </Link>
      </header>
      {account && account.role !== "operator" ? (
        <Compose regions={await listRegions()} role={account.role} />
      ) : (
        <section className="settings-card">
          <h1>이야기 쓰기</h1>
          <p>
            {account
              ? "운영자 계정에서는 주민·대표자 게시물을 작성할 수 없어요."
              : "로그인과 지역 인증 후 이야기를 나눌 수 있어요."}
          </p>
          {!account && (
            <Link className="primary" href="/login">
              로그인
            </Link>
          )}
        </section>
      )}
    </>
  );
}
