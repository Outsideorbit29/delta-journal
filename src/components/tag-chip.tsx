import Link from "next/link";
import { isWarningTag, tagLabel } from "@/lib/tags";

export function TagChip({ tag, detail, href }: { tag: string; detail?: string | null; href?: string }) {
  // A habit that costs money reads in the warning ink on its own paper; the rest are plain hairline tags.
  const tone = isWarningTag(tag) ? "bg-warn-soft text-warn border-transparent" : "border-rule text-ink-2";
  const className = `face-label inline-block whitespace-nowrap border px-1.5 py-0.5 text-xs no-underline ${tone}`;
  const label = tagLabel(tag);
  return href ? (
    <Link href={href} title={detail ?? undefined} className={`${className} hover:border-ink`}>
      {label}
    </Link>
  ) : (
    <span title={detail ?? undefined} className={className}>
      {label}
    </span>
  );
}
