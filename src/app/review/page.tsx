import Link from "next/link";
import { connection } from "next/server";
import { requireUserId } from "@/lib/session";
import { ReviewButtons } from "@/components/review-buttons";
import { ReviewView } from "@/components/review-view";
import { getDb } from "@/db";
import { AI_MODELS, aiConfigured } from "@/lib/ai/models";
import { listReviews } from "@/lib/ai/review";
import { formatDateTime } from "@/lib/format";

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  await connection();
  const userId = await requireUserId();
  const reviews = await listReviews(await getDb(), userId);
  const id = Number((await searchParams).id);
  const shown = reviews.find((r) => r.id === id) ?? reviews[0];

  return (
    <main id="main" className="container pt-10 pb-24">
      <div className="grid gap-x-8 gap-y-12 lg:grid-cols-12">
        <header className="space-y-6 lg:col-span-4">
          <div>
            <h1 className="text-3xl leading-none">AI review</h1>
            <p className="mt-3 text-base text-ink-2">
              A coach reads your trades, tags and journal notes and points out the habits that cost you money. It uses {AI_MODELS.review} through AI
              Gateway, so your trade data and notes are sent there.
            </p>
          </div>
          {aiConfigured() ? (
            <ReviewButtons />
          ) : (
            <p className="face-label bg-warn-soft px-4 py-3 text-sm text-warn">
              AI is off. Add <code>AI_GATEWAY_API_KEY</code> to <code>.env.local</code> and restart the app.
            </p>
          )}

          {reviews.length > 1 && (
            <section className="opens">
              <h2 className="text-xl">Earlier reviews</h2>
              <ul className="mt-3 divide-y divide-rule border-y border-rule-2">
                {reviews.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/review?id=${r.id}`}
                      aria-current={r.id === shown?.id ? "page" : undefined}
                      className={`block py-3 no-underline hover:bg-paper-2 ${r.id === shown?.id ? "text-ink" : "text-ink-2"}`}
                    >
                      <span className="face-label block text-sm text-muted">{formatDateTime(r.createdAt)}</span>
                      <span className={`block text-base ${r.id === shown?.id ? "underline decoration-accent decoration-2 underline-offset-4" : ""}`}>{r.review.headline}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </header>

        <div className="lg:col-span-8">
          {shown ? (
            <ReviewView row={shown} />
          ) : (
            <section className="opens max-w-2xl">
              <h2 className="text-xl">No reviews yet</h2>
              <p className="mt-2 text-ink-2">Ask for one with the buttons here, or wait for Sunday evening, when the weekly review is written for you.</p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
