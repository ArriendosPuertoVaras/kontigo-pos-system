import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Toast POS Replica",
  description: "Offline-first Restaurant POS System",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0", // Critical for touch POS
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body suppressHydrationWarning={true} className="bg-toast-charcoal text-toast-text-white antialiased h-screen w-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
