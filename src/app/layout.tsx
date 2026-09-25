import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { IdentityProvider } from "@/lib/useIdentity";
import { ThemeProvider } from "@/lib/useTheme";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "written — open social network",
  description:
    "An open, accountless microblog. Sign posts with your key or post anonymously. No signup required.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✍️</text></svg>",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-white text-black dark:bg-black dark:text-white transition-colors duration-150">
        <ThemeProvider>
          <IdentityProvider>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                className: "font-mono text-xs rounded-none border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white",
              }}
            />
          </IdentityProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
