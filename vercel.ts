import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  // Mumbai: next to Delta Exchange India and the Turso database (ap-south-1).
  regions: ["bom1"],
};
