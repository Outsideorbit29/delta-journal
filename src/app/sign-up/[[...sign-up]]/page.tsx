import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Sign up, Hardwon" };

export default function SignUpPage() {
  return (
    <main id="main" className="container flex flex-1 flex-col items-center justify-center py-16">
      <SignUp />
      <p className="face-label mt-8 text-center text-sm text-muted">
        By joining you agree to our{" "}
        <Link href="/terms" className="link">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="link">
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}
