import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon(): ImageResponse {
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
          borderRadius: 96,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 300,
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
