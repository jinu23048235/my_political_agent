import type { Post } from "./domain";
// Fictional data. Never load in production; see dataMode().
export const samplePosts: Post[] = [
  { id: "sample-crosswalk", regionCode: "seongsan1", kind: "request", body: "성산초등학교 앞 횡단보도, 저녁에도 안전하게 건널 수 있을까요?\n\n퇴근길에 보니 가로등 빛이 충분히 닿지 않더라고요. 아이들과 어르신들이 자주 다니는 길이라 조명 점검을 요청드립니다.", author: { id: "sample-citizen", name: "성산산책", role: "citizen" }, createdAt: "2026-10-18T05:20:00Z", empathy: 24, pinnedReplyId: "sample-answer", replies: [
    { id: "sample-answer", parentId: null, body: "담당 부서에 조도 점검을 요청했습니다. 확인되는 내용을 이 대화에 공유하겠습니다.", author: { id: "sample-rep", name: "김하늘", role: "representative", affiliation: "마포구의원" }, createdAt: "2026-10-18T06:10:00Z" },
    { id: "sample-followup", parentId: "sample-answer", body: "정류장 방향도 함께 확인해주세요.", author: { id: "sample-neighbor", name: "골목지기", role: "citizen" }, createdAt: "2026-10-18T06:24:00Z" }
  ] },
  { id: "sample-library", regionCode: "mapo", kind: "opinion", body: "동네 도서관 운영 시간에 관한 이야기를 듣고 있어요.\n\n평일 저녁과 주말 중 어느 시간에 이용이 어려우셨나요? 이용 경험을 남겨주세요.", author: { id: "sample-staff", name: "이서준 의원실", role: "staff", affiliation: "이서준 서울시의원" }, createdAt: "2026-10-18T02:30:00Z", empathy: 18, pinnedReplyId: null, replies: [] },
];
