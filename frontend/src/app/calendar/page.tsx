"use client";
import CalendarView from "@/components/CalendarView";
import { USER_ID } from "@/lib/utils";

export default function CalendarPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">📅 운동 일정 관리</h1>
        <p className="text-gray-400 text-sm mt-1">
          반복 운동 일정을 설정하면 해당 시간에 자동으로 알림이 오고 웹캠이 활성화됩니다.
        </p>
      </div>
      <CalendarView userId={USER_ID} />
    </div>
  );
}
