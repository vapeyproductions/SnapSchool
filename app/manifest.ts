import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SnapSchool",
    short_name: "SnapSchool",
    description:
      "Turn assignments into manageable daily missions and keep learning streaks moving.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#f4f0e8",
    theme_color: "#fffc00",
    orientation: "portrait-primary",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/snapschool-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/snapschool-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
