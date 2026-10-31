import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Delta Journal" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = (await searchParams).next;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Delta Journal</h1>
      <p className="mb-6 text-sm text-zinc-500">Enter your password to open your journal.</p>
      <LoginForm next={typeof next === "string" ? next : "/"} />
    </main>
  );
}
