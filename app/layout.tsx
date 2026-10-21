import type { Metadata } from "next";
import { geistSans, geistMono } from "./fuentes";
import "./globals.css";

export const metadata: Metadata = {
  title: "MaissyPOS",
  description: "Sistema de Gestion Operativa - Maissy Group",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
