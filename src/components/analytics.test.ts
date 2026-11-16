import { describe, expect, it } from "vitest";
import { redact } from "./analytics";

describe("analytics redaction", () => {
  it("drops query strings and trade ids before anything is sent", () => {
    expect(redact({ type: "pageview", url: "https://hardwon.in/trades/dhan:123:1?account=acc_x#j" })?.url).toBe("https://hardwon.in/trades/[id]");
    expect(redact({ type: "pageview", url: "https://hardwon.in/?account=acc_x&segment=options" })?.url).toBe("https://hardwon.in/");
    expect(redact({ type: "pageview", url: "not a url" })).toBeNull();
  });
});
