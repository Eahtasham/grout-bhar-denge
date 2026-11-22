import type { Metadata, Viewport } from "next";
import { Baloo_2 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Grout Bhar Denge",
  description: "60 second ka game: cracks mein grout bharo, zindagi ki problems bhi. Tu kitna bharega?",
  applicationName: "Grout Bhar Denge",
  appleWebApp: { capable: true, title: "Grout Bhar Denge", statusBarStyle: "default" },
  openGraph: {
    title: "Grout Bhar Denge",
    description: "Cracks mein grout bharo, problems bhi. Tu kitna bharega?",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F2B705",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${baloo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
