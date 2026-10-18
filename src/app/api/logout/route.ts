import { cookies } from "next/headers";
import { handle, sameOrigin } from "@/lib/server/http";
import {
  SESSION_COOKIE,
  revokeSession,
  sessionCookieOptions,
} from "@/lib/server/sessions";
export function POST(request: Request) {
  return handle(async () => {
    sameOrigin(request);
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) await revokeSession(token);
    store.set(SESSION_COOKIE, "", {
      ...sessionCookieOptions(new Date(0)),
      maxAge: 0,
    });
    return { loggedOut: true };
  });
}
