export type Role = "citizen" | "representative" | "staff" | "operator";
export type Region = { code: string; name: string; parentCode: string | null };
export type Author = {
  id: string;
  name: string;
  role: Role;
  affiliation?: string;
};
export type Reply = {
  id: string;
  parentId: string | null;
  body: string;
  author: Author;
  createdAt: string;
  replyCount?: number;
  deleted?: boolean;
  link?: string;
};
export type Post = {
  id: string;
  regionCode: string;
  kind: "story" | "request" | "opinion" | "explanation" | "progress";
  body: string;
  author: Author;
  createdAt: string;
  editedAt?: string;
  empathy: number;
  replies: Reply[];
  pinnedReplyId: string | null;
  deleted?: boolean;
  regionName?: string;
  replyCount?: number;
  link?: string;
  nextReplyCursor?: string;
  surveyId?: string;
  recipients?: {
    representativeId: string;
    name: string;
    status: string;
    joined: boolean;
  }[];
};
export const regions: Region[] = [
  { code: "seoul", name: "서울특별시", parentCode: null },
  { code: "mapo", name: "마포구", parentCode: "seoul" },
  { code: "gangnam", name: "강남구", parentCode: "seoul" },
  { code: "yeongdeungpo", name: "영등포구", parentCode: "seoul" },
  { code: "seongsan1", name: "성산1동", parentCode: "mapo" },
  { code: "mangwon1", name: "망원1동", parentCode: "mapo" },
];
export function containsRegion(
  parent: string,
  child: string,
  tree: Region[] = regions,
): boolean {
  const seen = new Set<string>();
  for (let code: string | null = child; code && !seen.has(code);) {
    if (code === parent) return true;
    seen.add(code);
    code = tree.find((region) => region.code === code)?.parentCode ?? null;
  }
  return false;
}
export function canCitizenParticipate(
  role: Role,
  certifications: { regionCode: string; expiresAt: Date }[],
  target: string,
  now = new Date(),
): boolean {
  return (
    role === "citizen" &&
    certifications.some(
      (cert) => cert.expiresAt > now && containsRegion(target, cert.regionCode),
    )
  );
}
export function dataMode(
  env: NodeJS.ProcessEnv,
): "empty" | "sample" | "database" {
  if (env.APP_DATA_MODE === "sample") {
    if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test")
      throw new Error("Sample data is allowed only in development or test.");
    return "sample";
  }
  if (
    env.APP_DATA_MODE === "database" ||
    (!env.APP_DATA_MODE && env.DATABASE_URL)
  ) {
    if (!env.DATABASE_URL)
      throw new Error("DATABASE_URL is required for database mode.");
    return "database";
  }
  return "empty";
}
export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
