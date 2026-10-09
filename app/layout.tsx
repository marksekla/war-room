import type { Metadata, Viewport } from "next";
import "./theme.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "War Room",
  description: "Open-source AI fantasy football agent for Sleeper leagues.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "War Room", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0e1014",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before the page paints (dark unless you picked light). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("war-room:theme");document.documentElement.dataset.theme=t==="light"?"light":"dark";}catch(e){}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700&display=swap"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
