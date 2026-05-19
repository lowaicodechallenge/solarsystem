"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/",         label: "Dashboard", icon: "dashboard" },
  { href: "/scanpose", label: "Posture",   icon: "accessibility_new" },
  { href: "/exercise", label: "Workout",   icon: "fitness_center" },
  { href: "/calendar", label: "Calendar",  icon: "calendar_today" },
];

export default function Sidebar() {
  const path = usePathname();
  // scan session: hide nav entirely (fullscreen HUD)
  if (path === "/scanpose/scan") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center px-4 pb-6 pt-2 bg-[#1c1b1b]/60 backdrop-blur-2xl border-t border-white/5">
      {navItems.map((item) => {
        const active = path === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 transition-all ${
              active
                ? "text-[#c3c0ff] bg-[#4a3aff]/20 rounded-xl py-1 px-3 shadow-[0_0_15px_rgba(74,58,255,0.25)] scale-110"
                : "text-[#c7c4da] opacity-50 hover:opacity-100 py-1 px-3"
            }`}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: "22px",
                fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
              }}
            >
              {item.icon}
            </span>
            <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
