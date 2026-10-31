import { describe, expect, it } from "vitest";
import { DeltaApiError } from "./client";

describe("DeltaApiError", () => {
  it("names the IP to whitelist", () => {
    const err = new DeltaApiError("ip_not_whitelisted_for_api_key", 401, { client_ip: "2401:db8::1" });
    expect(err.message).toBe("Delta API error: ip_not_whitelisted_for_api_key (HTTP 401). Whitelist this IP for your API key: 2401:db8::1");
    expect(new DeltaApiError("invalid_api_key", 401).message).toBe("Delta API error: invalid_api_key (HTTP 401)");
  });
});
