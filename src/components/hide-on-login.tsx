"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";

/** Hides app chrome (navigation, sync, account) on the sign-in, sign-up and waitlist pages. */
export function HideOnLogin({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return ["/sign-in", "/sign-up", "/waitlist"].some((p) => path.startsWith(p)) ? null : <>{children}</>;
}
