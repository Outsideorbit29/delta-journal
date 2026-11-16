"use client";

import { Analytics as VercelAnalytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics: page views only, without cookies. Before anything is sent, the query string (account ids,
 * filters) is dropped and trade ids in paths are replaced, so no personal or trading detail leaves the page.
 */
export function Analytics() {
  return <VercelAnalytics beforeSend={redact} />;
}

export function redact(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/^\/trades\/[^/]+/, "/trades/[id]");
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}
