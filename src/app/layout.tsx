import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VibeCheck - Security Scanner for Vibe-Coded Projects",
  description:
    "Scan your GitHub repository for security vulnerabilities and scalability issues. Get actionable fixes with one-click Cursor prompts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased min-h-screen`}
      >
        <TooltipProvider>
          <header className="border-b border-foreground/10 sticky top-0 z-50 bg-background/90 backdrop-blur-sm">
            <div className="max-w-[1600px] mx-auto px-6 md:px-12 h-12 flex items-center justify-between">
              <a
                href="/"
                className="font-mono text-xs uppercase tracking-[0.1em] font-semibold hover:opacity-70 transition-opacity"
              >
                VibeCheck
              </a>
              <nav className="flex items-center gap-6 font-mono text-xs uppercase tracking-[0.05em] text-muted-foreground">
                <a href="/" className="hover:text-foreground transition-colors">
                  Home
                </a>
                <a href="/scan" className="hover:text-foreground transition-colors">
                  Scan
                </a>
                <a href="/dashboard" className="hover:text-foreground transition-colors">
                  Dashboard
                </a>
              </nav>
            </div>
          </header>
          <main>{children}</main>
        </TooltipProvider>
      </body>
    </html>
  );
}
