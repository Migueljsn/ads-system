import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { LEGACY_POLYFILLS } from "@/lib/legacy-polyfills";

// HTML nunca em cache: depois de um deploy, uma página antiga apontaria para CSS/JS que não existem mais
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = { title: "Fonil Ads", description: "Meta + Google Ads com IA, API e MCP" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#07080c" };

/** navegadores de Smart TV (Samsung Tizen, LG webOS, Android/Google TV, Fire TV, Roku, Sony, Philips, Hisense…) */
const TV_UA = /smart-?tv|smarttv|tizen|web0s|webos|netcast|hbbtv|bravia|android tv|googletv|google tv|crkey|\baft[a-z]{1,3}\b|roku|philipstv|nettv|vidaa|hisense|viera|tv safari|\btv\b/i;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [h, c] = await Promise.all([headers(), cookies()]);
  const pref = c.get("tv")?.value; // ?tv=1 / ?tv=0 força o modo (gravado pelo proxy)
  const tv = pref ? pref === "1" : TV_UA.test(h.get("user-agent") ?? "");
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${inter.variable}${tv ? " tv" : ""}`}>
      <head>
        {/* precisa rodar antes dos scripts do Next: TVs antigas não têm globalThis, queueMicrotask, Array.at… */}
        <script dangerouslySetInnerHTML={{ __html: LEGACY_POLYFILLS }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
