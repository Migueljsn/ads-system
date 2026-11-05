import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// HTML nunca em cache: depois de um deploy, uma página antiga apontaria para CSS/JS que não existem mais
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = { title: "Fonil Ads", description: "Meta + Google Ads com IA, API e MCP" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
