import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TCG INTEL — Pokémon TCG Market Intelligence",
  description:
    "Track Pokémon TCG card and sealed product prices with data-driven buy/sell signals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
