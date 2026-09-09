import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KLÄFF",
    short_name: "KLÄFF",
    description: "Multiplayer-Bell-Wettkampf im Browser.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0A0F",
    theme_color: "#0B0A0F",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
