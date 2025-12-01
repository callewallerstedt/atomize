import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Rajdhani, IBM_Plex_Mono, Orbitron } from "next/font/google";
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

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Synapse",
  description: "Studying, Optimized.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/spinner.png", type: "image/png" },
      { url: "/spinner.png", sizes: "192x192", type: "image/png" },
      { url: "/spinner.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/spinner.png" },
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
  viewportFit: "cover", // Allows content to extend into safe areas on iOS
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" spellCheck="false" autoCorrect="off">
      <body className={`${geistSans.variable} ${geistMono.variable} ${rajdhani.variable} ${ibmPlexMono.variable} ${orbitron.variable} antialiased`} spellCheck="false" autoCorrect="off">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
