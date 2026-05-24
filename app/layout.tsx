import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PARANOIAS - AI Tactical Horror Simulator",
  description: "Can you survive the tactical bunker while avoiding the adaptive predator?",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased selection:bg-red-950 selection:text-red-200">
        {children}
      </body>
    </html>
  );
}
