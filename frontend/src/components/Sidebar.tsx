"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/scanpose", label: "자세 분석", icon: "accessibility_new" },
  { href: "/exercise", label: "운동 시작", icon: "fitness_center" },
  { href: "/calendar", label: "일정 관리", icon: "event" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="fixed left-0 top-0 h-full w-64 hidden md:flex flex-col z-40 bg-[#eff4ff] border-r border-[#c1c7c9] pt-16">
      <div className="px-4 py-5">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="material-symbols-outlined text-[#2f628c]"
            style={{ fontVariationSettings: "'FILL' 1", fontSize: "22px" }}
          >
            shield_with_heart
          </span>
          <span className="font-bold text-lg text-[#101c2a]">FitAI</span>
        </div>
        <p className="text-xs text-[#42484a]">AI 피트니스 코치</p>
      </div>

      <nav className="flex-1 px-2 space-y-0.5">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
              path === item.href
                ? "bg-[#9ecefd] text-[#235881]"
                : "text-[#42484a] hover:bg-[#dde9fd]"
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-3 pb-6">
        <Link
          href="/scanpose"
          className="w-full bg-[#2f628c] text-white rounded-lg py-2.5 flex items-center justify-center gap-2 text-xs font-semibold hover:opacity-90 transition-opacity mb-2"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>add</span>
          New Analysis
        </Link>
        <a
          href="#"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs text-[#42484a] hover:bg-[#dde9fd] transition-all"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>settings</span>
          Settings
        </a>
        <a
          href="#"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs text-[#42484a] hover:bg-[#dde9fd] transition-all"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>help</span>
          Support
        </a>
      </div>
    </aside>
  );
}
