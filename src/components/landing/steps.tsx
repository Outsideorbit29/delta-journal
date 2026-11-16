// "How it works": the three things a new member does, as numbered rows.

const STEPS = [
  {
    title: "Connect your broker",
    body: "Delta Exchange: a Read Data key with our server whitelisted. Dhan: paste an access token once; we renew it for you. Hardwon only reads, never trades.",
  },
  {
    title: "Every trade, rebuilt",
    body: "Fills become round-trip trades with every fee and charge: brokerage, STT and GST on Dhan; funding and stops on Delta, checked against its P&L to the cent.",
  },
  {
    title: "See what your habits cost",
    body: "Each trade is tagged, your costliest habits rise to the top, and a weekly AI review tells you what to change.",
  },
] as const;

export function Steps() {
  return (
    <ol className="list-none divide-y divide-rule border-y border-rule-2 p-0">
      {STEPS.map((s, i) => (
        <li key={s.title} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-6 gap-y-2 py-8 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-baseline">
          <span aria-hidden="true" className="figure-display row-span-2 text-[clamp(3rem,5vw,4.5rem)] text-ink sm:row-span-1">
            {i + 1}
          </span>
          <h3 className="text-[clamp(1.5rem,2vw,1.875rem)]">{s.title}</h3>
          <p className="text-lg text-ink-2">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
