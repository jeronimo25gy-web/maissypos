import type { Metadata } from "next";
import { geistSans, geistMono, titulos, texto } from "./fuentes";
import "./globals.css";

export const metadata: Metadata = {
  title: "MaissyPOS",
  description: "Sistema de gestión para distribuidoras y fábricas",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${titulos.variable} ${texto.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
