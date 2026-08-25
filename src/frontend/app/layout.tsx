import type { Metadata } from "next";
import "./globals.css";
import { LanguageController } from "@/components/LanguageController";
import { ClientShell } from "@/components/layout/ClientShell";
import { ThemeController } from "@/components/ThemeController";

export const metadata: Metadata = {
  title: "LectureBridge AI",
  description: "Evidence-grounded lecture intelligence and accessible learning tools.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className="antialiased h-full"
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col overflow-x-clip font-sans" suppressHydrationWarning>
        <LanguageController />
        <ThemeController />
        <ClientShell>
          {children}
        </ClientShell>
      </body>
    </html>
  );
}
