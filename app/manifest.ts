import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grout Bhar Denge",
    short_name: "Grout Bhar",
    description: "60 second ka game: cracks mein grout bharo, problems bhi.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F2B705",
    theme_color: "#F2B705",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
