import { ImageResponse } from "next/og";
import { mistriDataUri } from "@/lib/mistri";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", background: "#F2B705", borderRadius: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mistriDataUri("happy")} width={54} height={60} alt="" />
      </div>
    ),
    size,
  );
}
