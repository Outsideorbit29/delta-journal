import { ImageResponse } from "next/og";

/**
 * The app icon: a delta triangle over a small rising line, drawn as SVG so it
 * needs no font. `padding` shrinks the artwork for maskable icons, which
 * Android may crop to a circle.
 */
export function appIcon(size: number, { padding = 0.18, rounded = true } = {}) {
  const inner = size * (1 - padding * 2);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          borderRadius: rounded ? size * 0.22 : 0,
        }}
      >
        <svg width={inner} height={inner} viewBox="0 0 100 100">
          <path d="M50 10 L92 86 L8 86 Z" fill="none" stroke="#3987e5" strokeWidth="9" strokeLinejoin="round" />
          <path d="M28 70 L44 56 L56 64 L74 42" fill="none" stroke="#f0efec" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
