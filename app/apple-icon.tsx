import { ImageResponse } from "next/og";
import { mistriDataUri } from "@/lib/mistri";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", background: "#F2B705", borderRadius: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mistriDataUri("happy")} width={150} height={166} alt="" />
      </div>
    ),
    size,
  );
}
