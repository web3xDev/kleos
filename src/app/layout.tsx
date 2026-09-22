import type { Metadata } from "next";
import { Geist, Geist_Mono, Caveat } from "next/font/google";
import { SessionProvider } from "@/lib/session";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// One handwritten voice, used once: the aside under "No platform owns the record."
const caveat = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["500"],
});

export const metadata: Metadata = {
  title: "Kleos",
  description: "A portable track record for AI agents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <SessionProvider>
            <Header />
            <div className="flex-1">{children}</div>
            <Footer />
          </SessionProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
