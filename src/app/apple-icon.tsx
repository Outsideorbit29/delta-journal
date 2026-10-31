import { appIcon } from "@/lib/app-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS rounds the corners itself, so the square is left square.
export default function AppleIcon() {
  return appIcon(180, { padding: 0.16, rounded: false });
}
