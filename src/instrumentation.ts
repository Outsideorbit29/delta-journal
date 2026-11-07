import type { Instrumentation } from "next";

/**
 * Records every server error (pages, actions, API routes, the proxy) in app_errors, so the sync
 * server can tell the owner on Telegram. Recording never throws: if the database itself is down,
 * the uptime monitor on /api/health reports that instead.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const [{ getDb }, { errorInfo, recordAppError }] = await Promise.all([import("@/db"), import("@/lib/app-errors")]);
    await recordAppError(await getDb(), errorInfo(err, request, context));
  } catch (e) {
    console.error("Could not record the server error:", e instanceof Error ? e.message : e);
  }
};
