import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Terms of Service, Hardwon", description: "The terms for using Hardwon, a read-only trading journal for Delta Exchange India." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms are an agreement between you and <strong>{LEGAL.operator}</strong> for using Hardwon. By creating an account you accept
        them, along with our <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>What Hardwon is</h2>
      <p>
        Hardwon is a trading journal. It reads your trading records from Delta Exchange India with a read-only API key, rebuilds your trades,
        and helps you study your habits. It never places, changes or cancels orders. Hardwon is independent and is not affiliated with or
        endorsed by Delta Exchange.
      </p>

      <h2>Not investment advice</h2>
      <p>
        Nothing in Hardwon, including statistics, scores, insights and AI reviews, is investment, financial or tax advice, or a
        recommendation to buy or sell anything. AI reviews comment on your habits and process and can be wrong. Your trading decisions, and
        their results, are yours alone.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or older and use the service lawfully.</li>
        <li>Connect a Delta key with the Read Data permission only. Never give Hardwon a key that can trade or withdraw.</li>
        <li>Keep your sign-in secure, and tell us at once if you think someone else has used your account.</li>
        <li>Do not try to reach other users&apos; data, overload the service, or get around its limits.</li>
      </ul>

      <h2>Accuracy</h2>
      <p>
        We compute your trades, fees and profit and loss from the records Delta returns, and check them against Delta&apos;s own figures, but
        mistakes are possible. Delta&apos;s statements are the official record; check anything important against them.
      </p>

      <h2>The beta and pricing</h2>
      <p>
        Hardwon is in a private beta. Founding members use it free for 90 days from sign-up. After that we plan paid plans; we will tell you
        the price before anything is charged, and you can delete your account instead. During the beta, features may change and the service
        may sometimes be unavailable.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop at any time and delete your account and data in Settings. We may suspend or close an account that breaks these terms or
        puts the service or other users at risk, and will tell you why unless the law prevents it.
      </p>

      <h2>Liability</h2>
      <p>
        Hardwon is provided as it is. To the extent Indian law allows, we are not liable for trading losses or for indirect losses arising
        from your use of the service, and our total liability to you is limited to the amount you paid us in the 12 months before the claim.
        Nothing here limits rights you have under law that cannot be excluded.
      </p>

      <h2>Law and disputes</h2>
      <p>These terms are governed by the laws of India. Write to us first, and we will try to settle any issue together; otherwise the courts of India have jurisdiction.</p>

      <h2>Changes and contact</h2>
      <p>
        If we change these terms in a way that matters, we will tell you before the change takes effect. Questions:{" "}
        <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
      </p>
    </LegalPage>
  );
}
