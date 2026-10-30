import Link from "next/link";
import { connection } from "next/server";
import { ReviewButtons } from "@/components/review-buttons";
import { ReviewView } from "@/components/review-view";
import { getDb } from "@/db";
import { AI_MODELS, aiConfigured } from "@/lib/ai/models";
import { listReviews } from "@/lib/ai/review";
import { formatDateTime } from "@/lib/format";

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  await connection();
  const reviews = await listReviews(await getDb());
  const id = Number((await searchParams).id);
  const shown = reviews.find((r) => r.id === id) ?? reviews[0];

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI review</h1>
          <p className="text-sm text-zinc-500">
            A coach reads your trades, tags and journal notes and points out the habits that cost you money. It uses {AI_MODELS.review} through
            AI Gateway, so your trade data and notes are sent there.
          </p>
        </div>
        {aiConfigured() ? (
          <ReviewButtons />
        ) : (
          <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            AI is off. Add <code>AI_GATEWAY_API_KEY</code> to <code>.env.local</code> and restart the app.
          </p>
        )}
      </header>

      {shown ? (
        <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <ReviewView row={shown} />
        </section>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No reviews yet.
        </p>
      )}

      {reviews.length > 1 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-500">Earlier reviews</h2>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {reviews.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/review?id=${r.id}`}
                  aria-current={r.id === shown?.id ? "page" : undefined}
                  className={`block px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 ${r.id === shown?.id ? "font-medium" : ""}`}
                >
                  <span className="text-zinc-500">{formatDateTime(r.createdAt)} · </span>
                  {r.review.headline}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
