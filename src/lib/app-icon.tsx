import { ImageResponse } from "next/og";

/**
 * The app icon: the Edgebook mark (a rising line in paper on an ink square), drawn as SVG
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
          background: "#0c0d12", // --color-ink in sRGB; icons are rendered images, so the token is written out
          // Square, like everything else; iOS and Android round it themselves.
          borderRadius: rounded ? size * 0.04 : 0,
        }}
      >
        <svg width={inner} height={inner} viewBox="0 0 100 100">
          <path d="M12 70 L38 44 L56 60 L88 26" fill="none" stroke="#f7f5f0" strokeWidth="11" strokeLinecap="square" strokeLinejoin="miter" />
          <path d="M64 26 H88 V50" fill="none" stroke="#f7f5f0" strokeWidth="11" strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
