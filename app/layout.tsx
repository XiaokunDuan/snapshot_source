import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

import { ThemeProvider } from "./components/ThemeProvider";
import { LocaleProvider } from "./components/LocaleProvider";
import { PWARegistration } from "./components/PWARegistration";

export const metadata: Metadata = {
  title: "Snapshot - AI 学英语",
  description: "Your AI-powered language learning companion",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Snapshot",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <LocaleProvider>
            <PWARegistration />
            {children}
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );

  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInForceRedirectUrl="/"
      signUpForceRedirectUrl="/"
    >
      {content}
    </ClerkProvider>
  );
}
