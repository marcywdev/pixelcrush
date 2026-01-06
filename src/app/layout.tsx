import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "pixelcrush",
  description: "Create dithered pixel art with custom color palettes and export as GIF",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/fzd6vyl.css" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
