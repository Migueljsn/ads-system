import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Fonil Ads", description: "Meta + Google Ads com IA, API e MCP" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
