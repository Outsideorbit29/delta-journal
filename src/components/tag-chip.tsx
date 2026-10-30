import Link from "next/link";
import { isWarningTag, tagLabel } from "@/lib/tags";

export function TagChip({ tag, detail, href }: { tag: string; detail?: string | null; href?: string }) {
  const tone = isWarningTag(tag)
    ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  const className = `inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${tone}`;
  const label = tagLabel(tag);
  return href ? (
    <Link href={href} title={detail ?? undefined} className={`${className} hover:underline`}>
      {label}
    </Link>
  ) : (
    <span title={detail ?? undefined} className={className}>
      {label}
    </span>
  );
}
