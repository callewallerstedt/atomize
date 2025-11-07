import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Shell from "@/components/Shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Synapse",
  description: "Studying, Optimized.",
  manifest: "/manifest.webmanifest",
  themeColor: "#0F1216",
  icons: {
    icon: [
      { url: "/Logo.jpg", type: "image/jpeg" },
      { url: "/Logo.jpg", sizes: "192x192", type: "image/jpeg" },
      { url: "/Logo.jpg", sizes: "512x512", type: "image/jpeg" },
    ],
    apple: [
      { url: "/Logo.jpg" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Synapse",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
