import Link from "next/link";
import { Waitlist } from "@clerk/nextjs";

export const metadata = { title: "Join the waitlist, Edgebook" };

export default function WaitlistPage() {
  return (
    <main id="main" className="container flex flex-1 flex-col items-center justify-center py-16">
      <Waitlist />
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
