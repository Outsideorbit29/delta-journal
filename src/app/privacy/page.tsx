import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Privacy Policy, Hardwon", description: "What Hardwon collects, why, who processes it, and your rights under India’s DPDP Act." };

const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Hardwon is a trading journal. It reads your trades from Delta Exchange India or Dhan and shows the habits behind your results. This policy
        explains what personal data we hold, why, who helps us process it, and the rights you have under India&apos;s Digital Personal Data
        Protection Act, 2023 (the &quot;DPDP Act&quot;).
      </p>

      <h2>Who is responsible for your data</h2>
      <p>
        Hardwon is run by <strong>{LEGAL.operator}</strong>, the &quot;data fiduciary&quot; for your personal data. For any question,
        request or complaint about your data, write to {mail}. This address also acts as our grievance officer contact.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your email address and the name and picture from the sign-in you choose (for example Google). Sign-in
          is handled by Clerk.
        </li>
        <li>
          <strong>Your Delta Exchange API key and secret</strong>, if you connect one. They are locked (encrypted) the moment you save them, with
          a key only our sync server holds; our website can store them but can never read them back. We ask for a <strong>Read Data</strong>{" "}
          key only.
        </li>
        <li>
          <strong>Your Dhan client ID and access token</strong>, if you connect Dhan. We check the token with Dhan once when you save it,
          then lock it the same way; our sync server renews it each day (Dhan replaces the token when it does) and uses it only to read your
          trades and your profile&apos;s token expiry. It never places orders.
        </li>
        <li>
          <strong>Your trading records from Delta:</strong> fills, orders and wallet transactions (including deposits and withdrawals), which
          we rebuild into trades with fees, funding and profit and loss.
        </li>
        <li>
          <strong>Your trading records from Dhan:</strong> your executed trades with their charges (brokerage, STT, GST, exchange and SEBI
          fees, stamp duty), which we rebuild into trades with profit and loss.
        </li>
        <li>
          <strong>What you write:</strong> journal answers, notes and ratings. Voice notes you send on Telegram are turned into text; we keep
          the text, not the audio. Feedback you send us (from Settings or /feedback) is kept with your account and forwarded to the
          founder&apos;s Telegram, with your email, so we can reply.
        </li>
        <li>
          <strong>Telegram, if you connect it:</strong> your chat id, your Telegram username or first name, and the messages you send our bot.
        </li>
        <li>
          <strong>Phone notifications, if you turn them on:</strong> the browser&apos;s push address and a device label such as
          &quot;Android · Chrome&quot;.
        </li>
        <li>
          <strong>Technical data:</strong> our hosting providers keep short-lived request logs (such as IP address and browser) for security.
          We also keep a record of website errors (the page and the error message, without your personal details) for up to
          30 days, to fix problems.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To sync your trades, build your journal, statistics, behaviour score and charts, and show them only to you.</li>
        <li>To message you about closed trades, your weekly review and sync problems, on Telegram or your phone, if you turned them on.</li>
        <li>To write AI coaching reviews and suggest journal answers from your notes, when you use those features.</li>
        <li>To keep the service secure, prevent abuse, and answer you when you contact us.</li>
      </ul>
      <p>
        We process your data on the basis of your <strong>consent</strong>, which you give by creating an account and by connecting each
        service. You can withdraw it at any time: disconnect Delta, Dhan or Telegram, turn notifications off, or delete your account in Settings.
        We do not sell your data, show ads, or use it to trade.
      </p>

      <h2>AI features</h2>
      <p>
        When you ask for a review, or add a note or voice note, we send the needed trade summaries and text to an AI model through Vercel AI
        Gateway (currently models by Google and OpenAI) and store the result. The AI coach comments on habits and process only; it does not
        give trade calls or investment advice.
      </p>

      <h2>Who processes it for us</h2>
      <p>We use these providers, each only for the job listed:</p>
      <ul>
        <li>Clerk: accounts and sign-in.</li>
        <li>
          Vercel: hosting the website (Mumbai region), the AI Gateway, and Web Analytics, which counts page views without cookies; we
          remove trade ids and anything after the &quot;?&quot; in the address before it is sent.
        </li>
        <li>Turso: our database (Mumbai region).</li>
        <li>Amazon Web Services (Lightsail, Mumbai): our sync server, which talks to Delta Exchange and Dhan.</li>
        <li>Google and OpenAI: AI reviews, suggestions and voice transcription.</li>
        <li>Telegram, and your browser&apos;s push service (Google, Apple or Mozilla), for messages you turned on.</li>
      </ul>
      <p>
        Some of these providers process data outside India. We only use providers that protect it under their own security commitments, and
        we never transfer data to a country the Government of India has restricted.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while your account exists. When you delete your account, we erase your data from our database straight away; copies
        in our providers&apos; backups expire within 30 days. Disconnecting Delta or Dhan deletes your stored key or token at once.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>Access:</strong> download everything we hold about you from <Link href="/settings">Settings → Your data</Link>.
        </li>
        <li>
          <strong>Correction:</strong> edit your journal at any time. For anything else, email us.
        </li>
        <li>
          <strong>Erasure:</strong> delete your account from Settings, or email us.
        </li>
        <li>
          <strong>Nomination:</strong> you may name someone to exercise these rights if you die or cannot act. Email us to do so.
        </li>
        <li>
          <strong>Grievances:</strong> write to {mail}. We aim to reply within 30 days. If you are not satisfied, you can complain to the Data
          Protection Board of India.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Data travels encrypted (HTTPS). API keys are sealed so only our sync server can open them, and each one is tied to its owner&apos;s
        account. Every user&apos;s data is kept apart, and we test that one user can never see another&apos;s. No system is perfectly secure;
        if a breach affects you, we will tell you and the Data Protection Board as the DPDP Act requires.
      </p>

      <h2>Children</h2>
      <p>Hardwon is for adults. You must be 18 or older to use it.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we will tell you by email or in the app before the change takes effect.</p>
    </LegalPage>
  );
}
