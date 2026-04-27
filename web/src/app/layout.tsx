import "./globals.css";

import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Toaster } from "sonner";

import { QueryProvider } from "@/components/query-provider";
import { AppShell } from "@/components/shell/app-shell";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Ops Portal",
  description: "Migration operations portal for workbook migration, capacity, tracking, and execution control.",
  icons: { icon: "/favicon.ico" },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-[var(--font-sans)]">
        <QueryProvider>
          <AppShell>{children}</AppShell>
          <Toaster position="top-right" richColors />
        </QueryProvider>
      </body>
    </html>
  );
}

