"use client";

export default function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-end px-6 bg-[#f8f9ff] border-b border-[#c1c7c9]">
      <div className="flex items-center gap-1">
        <button className="p-2 text-[#42484a] hover:text-[#2f628c] transition-colors relative">
          <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <div className="w-9 h-9 rounded-full bg-[#d7e3f7] flex items-center justify-center text-sm font-bold text-[#2f628c] ml-1">
          U
        </div>
      </div>
    </header>
  );
}
