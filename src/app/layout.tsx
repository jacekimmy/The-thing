import type { Metadata } from "next";
import {
  Fraunces,
  Hanken_Grotesk,
  Plus_Jakarta_Sans,
  Space_Mono,
} from "next/font/google";
import "./globals.css";

// Creator demo pages: warm editorial serif + grotesk.
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const body = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

// Landing page: geometric sans for display, mono for wayfinding.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const mono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Twin",
  description: "Chat with a creator's AI twin, trained on their public content.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${jakarta.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
