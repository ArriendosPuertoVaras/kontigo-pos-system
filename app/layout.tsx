import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { AutoSyncProvider } from "@/components/providers/AutoSyncProvider";
import GlobalModals from "@/components/GlobalModals";

export const metadata: Metadata = {
  title: "KONTIGO - POS",
  description: "Offline-first Restaurant POS System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kontigo POS",
  },
  icons: {
    apple: "/pwa-icon.jpg",
    icon: "/pwa-icon.jpg",
  },
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
        <AutoSyncProvider>
          <GlobalModals />
          {children}
          <Toaster position="top-right" richColors />
        </AutoSyncProvider>
      </body>
    </html>
  );
}
