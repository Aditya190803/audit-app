import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bank Audit App — Statement Auditing for CA Firms",
  description:
    "Desktop tool that ingests bank statement PDFs, automatically tags transactions via fuzzy matching, and enables efficient manual review with full audit trail and flexible export.",
  keywords: [
    "bank audit",
    "statement auditing",
    "CA firm",
    "chartered accountant",
    "PDF analysis",
    "transaction tagging",
  ],
  openGraph: {
    title: "Bank Audit App",
    description:
      "Faster audit turnaround with fewer missed anomalies. Automatically tag bank statement transactions and review with confidence.",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
