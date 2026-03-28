import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Coach — AI Opening Analysis",
  description: "Stockfish + Claude multi-agent chess coaching. Understand your opening mistakes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0f0f0f] text-[#ededed]">
        <main className="max-w-4xl mx-auto px-4 py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
