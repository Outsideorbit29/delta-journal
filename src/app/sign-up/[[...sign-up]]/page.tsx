import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Sign up · Edgebook" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-12">
      <SignUp />
      <p className="mt-6 text-center text-xs text-zinc-500">
        By joining you agree to our{" "}
        <Link href="/terms" className="text-zinc-400 underline-offset-2 hover:underline">Terms</Link> and{" "}
        <Link href="/privacy" className="text-zinc-400 underline-offset-2 hover:underline">Privacy Policy</Link>.
      </p>
    </main>
  );
}
