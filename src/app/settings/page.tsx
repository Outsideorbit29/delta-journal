import { connection } from "next/server";
import { AccountData } from "@/components/account-data";
import { AutoRefresh } from "@/components/auto-refresh";
import { DeltaConnect } from "@/components/delta-connect";
import { FeedbackForm } from "@/components/feedback-form";
import { PushSettings } from "@/components/push-settings";
import { TelegramConnect } from "@/components/telegram-connect";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDb } from "@/db";
import { DELETE_CONFIRMATION } from "@/lib/account";
import { aiConfigured } from "@/lib/ai/models";
import { FEEDBACK_MAX } from "@/lib/feedback";
import { formatDateTime } from "@/lib/format";
import { getDeltaKeyStatus } from "@/lib/keys/credentials";
import { vapidPublicKey } from "@/lib/push";
import { getSyncStatus } from "@/lib/queries";
import { requireUserId } from "@/lib/session";
import { explainSyncError } from "@/lib/sync-errors";
import { getTelegramLink } from "@/lib/telegram/links";

export default async function SettingsPage() {
  await connection();
  const userId = await requireUserId();
  const db = await getDb();
  const [sync, key, telegram] = await Promise.all([getSyncStatus(userId), getDeltaKeyStatus(db, userId), getTelegramLink(db, userId)]);
  const lastRun = Math.max(0, ...sync.map((s) => s.lastRunAt ?? 0));
  const error = sync.find((s) => s.lastError)?.lastError;

  return (
    <main id="main" className="container pt-10 pb-24">
      <h1 className="text-3xl leading-none">Settings</h1>

      <div className="mt-8 border-t-4 border-ink">
        <Group title="Delta Exchange" intro="A read-only key lets Hardwon sync your trades every minute.">
          <DeltaConnect status={key} syncedBefore={lastRun > 0} />
        </Group>

        <Group title="Telegram" intro="Journal each closed trade from your phone in a few taps.">
          {/* Remounts once the chat links, so the one-time link disappears. */}
          <TelegramConnect key={telegram.linkedAt ?? "none"} linked={telegram.linked} chatName={telegram.chatName} />
          {telegram.waiting && <AutoRefresh />}
        </Group>

        <Group
          title="Notifications"
          intro="On this device: a closed trade (tap it to journal), your weekly review, and any problem syncing with Delta."
        >
          <PushSettings publicKey={vapidPublicKey()} />
        </Group>

        <Group title="Appearance" intro="Light paper or dark. Kept in this browser.">
          <ThemeToggle />
        </Group>

        <Group title="Feedback" intro="Found a bug, or wish Hardwon did something? It goes straight to the founder, who reads every message.">
          <FeedbackForm max={FEEDBACK_MAX} />
        </Group>

        <Group title="Status">
          <dl className="face-label divide-y divide-rule border-y border-rule-2 text-base">
            <div className="grid gap-x-6 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <dt className="text-muted">Last sync with Delta</dt>
              <dd className="text-ink">
                {lastRun ? `${formatDateTime(lastRun)} IST` : "never"}
                {error && <span className="mt-1 block text-warn">{explainSyncError(error)}</span>}
              </dd>
            </div>
            <div className="grid gap-x-6 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <dt className="text-muted">Syncing runs</dt>
              <dd className="text-ink">on the Hardwon server, every minute</dd>
            </div>
            <div className="grid gap-x-6 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <dt className="text-muted">AI features</dt>
              <dd className="text-ink">{aiConfigured() ? "on" : "off (no AI_GATEWAY_API_KEY)"}</dd>
            </div>
          </dl>
        </Group>

        <Group title="Your data">
          <AccountData confirmWord={DELETE_CONFIRMATION} />
        </Group>
      </div>
    </main>
  );
}

/** One settings group: its head and a line on the left, the controls on the right, a hairline between groups. */
function Group({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-8 gap-y-5 border-b border-rule-2 py-10 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <h2 className="text-xl">{title}</h2>
        {intro && <p className="mt-2 max-w-sm text-base text-muted">{intro}</p>}
      </div>
      <div className="min-w-0 lg:col-span-8">{children}</div>
    </section>
  );
}
