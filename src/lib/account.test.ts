import { describe, expect, it } from "vitest";
import { csvCell } from "./account";

describe("csvCell", () => {
  it("leaves plain values alone and quotes commas, quotes and line breaks", () => {
    expect(csvCell(-4.75)).toBe("-4.75");
    expect(csvCell(null)).toBe("");
    expect(csvCell("XAUTUSD")).toBe("XAUTUSD");
    expect(csvCell('moved stop, "hoped"')).toBe('"moved stop, ""hoped"""');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("stops a spreadsheet from running a note as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+1 R")).toBe("'+1 R");
    expect(csvCell("-sized up")).toBe("'-sized up");
    expect(csvCell("@me")).toBe("'@me");
  });
});
