export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ApiError(400, "올바른 항목을 지정해주세요.");
  return value;
}
export function text(value: unknown, label: string, max = 2000): string {
  if (typeof value !== "string" || !value.trim() || [...value].length > max)
    throw new ApiError(400, `${label} 내용을 확인해주세요.`);
  return value;
}
export function fields(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new ApiError(400, "변경할 수 없는 항목이 포함되어 있어요.");
}
export function publicError(error: unknown): {
  status: number;
  message: string;
} {
  if (error instanceof ApiError)
    return { status: error.status, message: error.message };
  const code = (error as { code?: string })?.code;
  if (code === "23505")
    return { status: 409, message: "이미 사용 중인 값이에요." };
  if (["23503", "23514", "22P02"].includes(code ?? ""))
    return { status: 400, message: "입력한 값과 연결 항목을 확인해주세요." };
  if (code === "P0001")
    return {
      status: 409,
      message: "현재 상태에서는 변경할 수 없어요. 새로고침 후 확인해주세요.",
    };
  return {
    status: 503,
    message: "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.",
  };
}
