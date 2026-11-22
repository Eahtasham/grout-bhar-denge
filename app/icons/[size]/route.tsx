import { ImageResponse } from "next/og";
import { mistriDataUri } from "@/lib/mistri";

const SIZES = ["192", "512"] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

/** PNG app icons for the web app manifest: the Mistri on turmeric. */
export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params;
  const px = size === "192" ? 192 : 512;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", background: "#F2B705" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mistriDataUri("happy")} width={px * 0.78} height={px * 0.86} alt="" />
      </div>
    ),
    { width: px, height: px },
  );
}
