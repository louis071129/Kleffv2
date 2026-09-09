import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B0A0F",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 110,
            fontWeight: 800,
            color: "#B8FF3D",
            transform: "skewX(-6deg)",
          }}
        >
          K
        </div>
      </div>
    ),
    { ...size },
  );
}
