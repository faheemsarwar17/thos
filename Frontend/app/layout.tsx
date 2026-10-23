import type { Metadata } from "next";
import "@livekit/components-styles";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast-provider";

export const metadata: Metadata = {
  title: "THOS · Talent Hiring Operating System",
  description: "General hiring platform with domain packs for focused interviews",
};

// Applies the stored theme before first paint so every route (including shell-less focus pages) honours it.
const themeInit = `try{var t=localStorage.getItem("thos-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
