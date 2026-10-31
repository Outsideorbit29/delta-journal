import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Sign in · Edgebook" };

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-12">
      <SignIn />
    </main>
  );
}
