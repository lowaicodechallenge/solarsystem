"use client";
import CalendarView from "@/components/CalendarView";
import { USER_ID } from "@/lib/utils";

export default function CalendarPage() {
  return (
    <div className="min-h-screen bg-[#f8f9ff] px-6 pb-10">
      <div className="py-6">
        <h1 className="text-[32px] font-bold text-[#101c2a] leading-10">일정 관리</h1>
        <p className="text-sm text-[#42484a] mt-1">Google Calendar를 연동해 빈 시간대에 운동 블록을 등록하세요.</p>
      </div>
      <div className="max-w-lg mx-auto">
        <CalendarView userId={USER_ID} />
      </div>
    </div>
  );
}
