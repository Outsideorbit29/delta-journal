import { describe, expect, it } from "vitest";
import { formatMoney } from "./format";

describe("formatMoney", () => {
  it("writes dollars by default and rupees with Indian grouping", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(-4.75, { sign: true })).toBe("-$4.75");
    expect(formatMoney(125000, { sign: true, currency: "INR" })).toBe("+₹1,25,000.00");
    expect(formatMoney(-5032.67, { currency: "INR" })).toBe("-₹5,032.67");
    expect(formatMoney(null, { currency: "INR" })).toBe("–");
  });
});
