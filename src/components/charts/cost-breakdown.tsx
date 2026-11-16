import type { Currency } from "@/db/schema";
import { formatMoney } from "@/lib/format";
import type { Stats } from "@/lib/stats";

/**
 * Gross trading result and each cost, as bars from a shared zero line, ending
 * in the net result. Every bar carries its value, so nothing hides in a tooltip.
 */
export function CostBreakdown({ stats, currency = "USD" }: { stats: Stats; currency?: Currency }) {
  const rows = [
    { label: "Trading P&L before costs", value: stats.grossPnl },
    { label: "Fees", value: -stats.fees },
    { label: "Liquidation fees", value: -stats.liquidationFees },
    { label: "Funding", value: stats.funding },
    { label: "Net P&L", value: stats.netPnl, total: true },
  ].filter((r) => r.total || Math.abs(r.value) >= 0.005);

  const min = Math.min(0, ...rows.map((r) => r.value));
  const max = Math.max(0, ...rows.map((r) => r.value));
  const span = max - min || 1;
  // Leave room at each end for the value label outside the bar.
  const zero = ((0 - min) / span) * 100;
  const costs = stats.fees + stats.liquidationFees;

  return (
    <div className="face-label space-y-3">
      <ul className="space-y-2">
        {rows.map((r) => {
          const width = (Math.abs(r.value) / span) * 100;
          const negative = r.value < 0;
          return (
            <li key={r.label} className={`text-sm ${r.total ? "border-t border-[var(--viz-grid)] pt-2" : ""}`}>
              <span className={r.total ? "font-medium text-[var(--viz-ink)]" : "text-[var(--viz-ink-2)]"}>{r.label}</span>
              {/* Side margins keep room for the value label beyond the bar's end. */}
              <div className="relative mx-20 mt-0.5 h-5">
                <div className="absolute inset-y-0 w-px bg-[var(--viz-axis)]" style={{ left: `${zero}%` }} aria-hidden />
                <div
                  className="absolute top-0.5 h-4"
                  style={{
                    left: negative ? `${zero - width}%` : `${zero}%`,
                    width: `${width}%`,
                    background: negative ? "var(--viz-loss)" : "var(--viz-profit)",
                    opacity: r.total ? 1 : 0.85,
                  }}
                  aria-hidden
                />
                <span
                  className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-sm tabular-nums ${r.total ? "font-semibold text-[var(--viz-ink)]" : "text-[var(--viz-ink-2)]"}`}
                  style={negative ? { right: `calc(${100 - zero + width}% + 6px)` } : { left: `calc(${zero + width}% + 6px)` }}
                >
                  {formatMoney(r.value, { sign: true, currency })}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {costs > 0 && (
        <p className="text-sm text-[var(--viz-ink-2)]">
          {stats.grossPnl > 0
            ? `Costs took ${Math.round((costs / stats.grossPnl) * 100)}% of your gross profit.`
            : stats.netPnl < 0
              ? `Costs make up ${Math.round((costs / -stats.netPnl) * 100)}% of your net loss.`
              : `Costs were ${formatMoney(costs, { currency })}.`}
          {stats.feeCredits > 0 && ` Fee credits covered another ${formatMoney(stats.feeCredits, { currency })}.`}
        </p>
      )}
    </div>
  );
}
