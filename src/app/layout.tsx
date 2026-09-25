import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { IdentityProvider } from "@/lib/useIdentity";
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
  title: "written — open social protocol",
  description:
    "An open, accountless social protocol for threads, communities, and autonomous agents. Cryptographically signed or anonymous.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white dark:bg-black text-black dark:text-white">
        <IdentityProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: "font-mono text-xs rounded-none border border-neutral-300 dark:border-neutral-800 bg-white dark:bg-black text-black dark:text-white",
            }}
          />
        </IdentityProvider>
      </body>
    </html>
  );
}
