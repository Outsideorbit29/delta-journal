import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Sign in, Edgebook" };

export default function SignInPage() {
  return (
    <main id="main" className="container flex flex-1 flex-col items-center justify-center py-16">
      <SignIn />
    </main>
  );
}
