"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authMode, checkPassword, createSession, safeNextPath, SESSION_COOKIE } from "@/lib/auth";

export interface LoginState {
  error: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (authMode() === "misconfigured") return { error: "Login is not set up: add APP_PASSWORD to the server's environment." };
  if (!checkPassword(String(form.get("password") ?? ""))) {
    // Slows down password guessing.
    await sleep(800);
    return { error: "Wrong password." };
  }
  const { token, expires } = createSession();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  redirect(safeNextPath(form.get("next")));
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
