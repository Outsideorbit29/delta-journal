// AI models used by the journal, all reached through Vercel AI Gateway with
// AI_GATEWAY_API_KEY. Each can be overridden in .env.local with an id from
// https://ai-gateway.vercel.sh/v1/models.

// The defaults are models the AI Gateway free tier allows. With paid credits,
// stronger models such as anthropic/claude-sonnet-5.5 can be set instead.
export const AI_MODELS = {
  /** Weekly coaching review: needs good reasoning over a few dozen trades. */
  review: process.env.AI_REVIEW_MODEL ?? "google/gemini-2.5-flash",
  /** Tagging a note: a small, fast, cheap model is enough. */
  fast: process.env.AI_FAST_MODEL ?? "google/gemini-2.5-flash",
  /** Telegram voice notes. */
  transcribe: process.env.AI_TRANSCRIBE_MODEL ?? "openai/gpt-4o-mini-transcribe",
};

/** AI features are off until a gateway key (or Vercel OIDC token) is present. */
export const aiConfigured = () => Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

export const AI_NOT_CONFIGURED = "AI features are off. Add AI_GATEWAY_API_KEY to .env.local to turn them on.";

/** A message you can act on for the gateway failures that happen in practice. */
export function explainAiError(err: unknown): string {
  for (let e: unknown = err; e; e = (e as { cause?: unknown }).cause) {
    const name = (e as Error).name ?? "";
    const message = (e as Error).message ?? "";
    if (name === "GatewayAuthenticationError") return "AI Gateway rejected the key. Check AI_GATEWAY_API_KEY in .env.local.";
    if (name === "GatewayRateLimitError") return "AI Gateway is rate limiting requests. Try again in a minute.";
    if (name === "GatewayModelNotFoundError") return "That AI model is not available on AI Gateway. Check the model setting in .env.local.";
    if (/free tier/i.test(message)) return "Your AI Gateway free tier does not include this model. Use a free-tier model in .env.local or add paid credits.";
    if (/insufficient.*(credit|fund|balance)|no credits|budget/i.test(message)) return "AI Gateway is out of credits or over budget. Top up in the Vercel dashboard.";
  }
  return `AI request failed: ${err instanceof Error ? err.message : String(err)}`;
}
