"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";

/** Hides app chrome (navigation, sync, sign out) on the sign-in page. */
export function HideOnLogin({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  return usePathname() === "/login" ? null : <>{children}</>;
}
