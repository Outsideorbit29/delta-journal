import { appIcon } from "@/lib/app-icon";

const SIZES = new Set([192, 512]);

// GET /pwa-icon/192, /pwa-icon/512, /pwa-icon/512?maskable
export async function GET(request: Request, { params }: RouteContext<"/pwa-icon/[size]">) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = new URL(request.url).searchParams.has("maskable");
  const res = appIcon(size, maskable ? { padding: 0.26, rounded: false } : {});
  res.headers.set("Cache-Control", "public, max-age=86400");
  return res;
}
