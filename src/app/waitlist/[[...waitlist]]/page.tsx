import { Waitlist } from "@clerk/nextjs";

export const metadata = { title: "Join the waitlist · Edgebook" };

export default function WaitlistPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-12">
      <Waitlist />
    </main>
  );
}
