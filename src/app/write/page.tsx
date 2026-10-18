import Link from "next/link";
export const metadata = { title: "이야기 쓰기" };
export default function Write() { return <><header className="view-header"><Link className="back" href="/">← 지역 피드</Link></header><section className="settings-card"><h1>이야기 쓰기</h1><p>로그인과 지역 인증 후 이야기를 나눌 수 있어요.</p><p className="small">작성한 이야기는 공개됩니다.</p></section></>; }
