import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hardwon",
    short_name: "Hardwon",
    description: "Trading journal and habit insights for Delta Exchange and Dhan traders",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // The paper colour (--color-paper in sRGB): the splash screen and the browser bar.
    background_color: "#f7f5f0",
    theme_color: "#f7f5f0",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512?maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
