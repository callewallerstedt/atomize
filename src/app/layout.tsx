import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Rajdhani, IBM_Plex_Mono } from "next/font/google";
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

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: "600", // Semibold
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Synapse",
  description: "Studying, Optimized.",
  manifest: "/manifest.webmanifest",
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

export const viewport: Viewport = {
  themeColor: "#0F1216",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${rajdhani.variable} ${ibmPlexMono.variable} antialiased`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
