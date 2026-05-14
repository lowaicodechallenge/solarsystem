import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitAI - AI 피트니스 코치",
  description: "웹캠 자세 분석으로 나만의 AI 홈트 코치",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Navbar />
        <Sidebar />
        <main className="md:ml-64 pt-16 min-h-screen">{children}</main>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: { background: "#1a1a1a", color: "#fff", border: "1px solid #333" },
          }}
        />
      </body>
    </html>
  );
}
