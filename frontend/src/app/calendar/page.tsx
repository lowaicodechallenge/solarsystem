"use client";
import CalendarView from "@/components/CalendarView";
import { USER_ID } from "@/lib/utils";

export default function CalendarPage() {
  return (
    <div className="min-h-screen bg-[#050505] px-5 pb-10">
      <div className="py-6">
        <h1 className="font-oswald text-3xl font-bold text-[#e5e2e1] uppercase tracking-tight">일정 관리</h1>
        <p className="text-sm text-[#c7c4da]/50 mt-1">Google Calendar를 연동해 빈 시간대에 운동 블록을 등록하세요.</p>
      </div>
      <div className="max-w-lg mx-auto">
        <CalendarView userId={USER_ID} />
      </div>
    </div>
  );
}
