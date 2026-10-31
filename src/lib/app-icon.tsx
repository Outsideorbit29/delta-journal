import { ImageResponse } from "next/og";

/**
 * The app icon: the Edgebook mark (a rising line on a teal tile), drawn as SVG
 * so it needs no font. `padding` shrinks the artwork for maskable icons, which
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
          background: "#2dd4bf",
          borderRadius: rounded ? size * 0.22 : 0,
        }}
      >
        <svg width={inner} height={inner} viewBox="0 0 100 100">
          <path d="M12 70 L38 44 L56 60 L88 26" fill="none" stroke="#042f2e" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M64 26 H88 V50" fill="none" stroke="#042f2e" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
