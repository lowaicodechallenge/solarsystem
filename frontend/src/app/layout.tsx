import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "솔메이트 - AI 피트니스 코치",
  description: "웹캠 자세 분석으로 나만의 AI 홈트 코치",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body>
        <main className="pb-24 min-h-screen">{children}</main>
        <Sidebar />
        <Toaster
          position="top-center"
          toastOptions={{
            style: { background: "#1c1b1b", color: "#e5e2e1", border: "1px solid rgba(255,255,255,0.1)" },
          }}
        />
      </body>
    </html>
  );
}
