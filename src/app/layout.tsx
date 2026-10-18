import type { Metadata } from "next";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
import "./globals.css";
import { viewer } from "@/lib/server/http";
import { EmploymentCheck } from "@/components/mutations";
export const metadata: Metadata = {
  title: { default: "우리동네이야기", template: "%s · 우리동네이야기" },
  description: "이웃과 대표자가 지역의 이야기를 함께 나누는 공간",
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const account = await viewer();
  return (
    <html lang="ko">
      <body>
        <a className="skip-link" href="#main">
          본문으로 건너뛰기
        </a>
        <div className="shell">
          <aside className="sidebar">
            <Link className="brand" href="/">
              <span className="brand-mark" aria-hidden="true">
                ↗
              </span>
              우리동네이야기
            </Link>
            <Navigation />
            <Link className="primary write-link" href="/write">
              ＋ 이야기 쓰기
            </Link>
            <div className="side-note">
              작은 이야기가 모여
              <br />
              우리 동네의 내일이 됩니다.
            </div>
          </aside>
          <main id="main">
            {account?.staffCheckRequired ? <EmploymentCheck /> : children}
          </main>
          <aside className="rightbar">
            <div className="aside-card aside-hero">
              <h2>
                우리 동네의 변화,
                <br />
                이야기에서 시작해요.
              </h2>
              <p>
                주민의 경험과 대표자의 설명을
                <br />
                한곳에서 이어갑니다.
              </p>
            </div>
            <div className="aside-card">
              <h2>동네에서 함께 참여해요</h2>
              <p>
                누구나 이야기를 읽을 수 있어요.
                <br />
                작성과 참여에는 지역 인증이 필요해요.
              </p>
            </div>
          </aside>
        </div>
        <Navigation mobile />
      </body>
    </html>
  );
}
