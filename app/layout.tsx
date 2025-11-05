import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nebula Dash",
  description: "Fast-paced browser arcade built with Next.js",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
