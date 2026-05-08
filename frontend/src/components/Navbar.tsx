"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/workout", label: "운동", icon: "💪" },
  { href: "/battle", label: "대결", icon: "⚔️" },
  { href: "/calendar", label: "일정", icon: "📅" },
];

export default function Navbar() {
  const path = usePathname();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-800/90 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">🏋️</span>
          <span className="text-lg font-bold text-white">
            Fit<span className="text-primary-500">AI</span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                path === l.href
                  ? "bg-primary-500/20 text-primary-400"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              <span>{l.icon}</span>
              <span className="hidden sm:inline">{l.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
