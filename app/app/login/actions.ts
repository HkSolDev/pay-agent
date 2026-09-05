"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAuthToken, COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "../../lib/auth";

export type LoginState = {
  error?: string;
};

export async function loginAction(
  _prevState: LoginState | null,
  formData: FormData
): Promise<LoginState> {
  const password = formData.get("password")?.toString() || "";
  const nextParam = formData.get("next")?.toString();
  const expectedPassword = process.env.APP_ACCESS_PASSWORD;

  if (!expectedPassword) {
    return { error: "Access password is not configured on the server." };
  }

  if (password !== expectedPassword) {
    return { error: "Incorrect password. Please try again." };
  }

  const token = await createAuthToken(expectedPassword);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  const destination =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";

  redirect(destination);
}
