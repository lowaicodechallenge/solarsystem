"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { EXERCISES } from "@/lib/utils";
import { format, addDays, startOfWeek } from "date-fns";
import { ko } from "date-fns/locale";

type ScheduledWorkout = {
  id: string;
  exercise_type: string;
  scheduled_time: string;
  google_event_id?: string;
};

type Props = { userId: string };

const DAYS_KR = ["월", "화", "수", "목", "금", "토", "일"];

export default function CalendarView({ userId }: Props) {
  const [upcoming, setUpcoming] = useState<ScheduledWorkout[]>([]);
  const [exercise, setExercise] = useState("squat");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [time, setTime] = useState("07:00");
  const [googleToken, setGoogleToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.getUpcoming(userId).then((res) => {
      setUpcoming(res as ScheduledWorkout[]);
    }).catch(() => {});

    const saved = localStorage.getItem("google_token");
    if (saved) setGoogleToken(saved);
  }, [userId]);

  const connectGoogle = async () => {
    try {
      const res = await api.getGoogleAuthUrl();
      window.open(res.url, "_blank", "width=600,height=600");
    } catch {
      alert("Google Calendar 연동 설정이 필요합니다. (환경 변수 확인)");
    }
  };

  const scheduleRecurring = async () => {
    if (selectedDays.length === 0) {
      alert("운동할 요일을 선택해주세요.");
      return;
    }
    setLoading(true);
    try {
      await api.scheduleRecurring({
        user_id: userId,
        days_of_week: selectedDays,
        time,
        exercise_type: exercise,
        duration_minutes: 30,
        google_token: googleToken,
        weeks: 4,
      });
      setSuccess(true);
      const res = await api.getUpcoming(userId);
      setUpcoming(res as ScheduledWorkout[]);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      alert("일정 등록에 실패했습니다.");
    }
    setLoading(false);
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const exName = (type: string) => EXERCISES.find((e) => e.id === type)?.name ?? type;
  const exEmoji = (type: string) => EXERCISES.find((e) => e.id === type)?.emoji ?? "💪";

  return (
    <div className="space-y-4">
      {/* Recurring Schedule Setup */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <h3 className="font-bold text-white">반복 운동 일정 설정</h3>
        <p className="text-xs text-gray-400">설정한 시간에 자동으로 웹캠이 활성화되어 강제로 운동을 시작할 수 있습니다.</p>

        {/* Exercise */}
        <div className="space-y-2">
          <label className="text-xs text-gray-500">운동 종류</label>
          <div className="flex gap-2">
            {EXERCISES.map((ex) => (
              <button
                key={ex.id}
                onClick={() => setExercise(ex.id)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border ${
                  exercise === ex.id
                    ? "border-primary-500 bg-primary-500/10 text-primary-400"
                    : "border-white/5 bg-dark-700 text-gray-400"
                }`}
              >
                {ex.emoji} {ex.name}
              </button>
            ))}
          </div>
        </div>

        {/* Days */}
        <div className="space-y-2">
          <label className="text-xs text-gray-500">요일 선택 (복수 선택 가능)</label>
          <div className="flex gap-1.5">
            {DAYS_KR.map((d, i) => (
              <button
                key={i}
                onClick={() => toggleDay(i)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border ${
                  selectedDays.includes(i)
                    ? "border-primary-500 bg-primary-500/20 text-primary-400"
                    : "border-white/5 bg-dark-700 text-gray-400 hover:border-white/20"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Time */}
        <div className="space-y-2">
          <label className="text-xs text-gray-500">운동 시간</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full bg-dark-600 border border-white/8 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-primary-500/50"
          />
        </div>

        {/* Google Calendar toggle */}
        <div className="flex items-center justify-between p-3 bg-dark-600 rounded-xl">
          <div>
            <p className="text-sm text-white">Google Calendar 연동</p>
            <p className="text-xs text-gray-500">알림과 함께 캘린더에 자동 등록</p>
          </div>
          {googleToken ? (
            <span className="text-xs text-primary-400 font-medium">✅ 연결됨</span>
          ) : (
            <button
              onClick={connectGoogle}
              className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs font-medium transition-all"
            >
              연결하기
            </button>
          )}
        </div>

        <button
          onClick={scheduleRecurring}
          disabled={loading || selectedDays.length === 0}
          className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-black font-bold rounded-xl transition-all"
        >
          {loading ? "등록 중..." : success ? "✅ 등록 완료!" : "4주 일정 등록"}
        </button>
      </div>

      {/* Upcoming workouts */}
      {upcoming.length > 0 && (
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <h3 className="font-bold text-white">예정된 운동</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {upcoming.slice(0, 10).map((w) => {
              const dt = new Date(w.scheduled_time);
              return (
                <div key={w.id} className="flex items-center gap-3 p-3 bg-dark-600 rounded-xl">
                  <span className="text-2xl">{exEmoji(w.exercise_type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{exName(w.exercise_type)}</p>
                    <p className="text-xs text-gray-400">
                      {format(dt, "M월 d일 (EEEE) HH:mm", { locale: ko })}
                    </p>
                  </div>
                  {w.google_event_id && (
                    <span className="text-xs text-blue-400 flex-shrink-0">📅 캘린더</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Auto-launch notice */}
      <div className="rounded-2xl p-4 bg-amber-500/10 border border-amber-500/20">
        <p className="text-amber-400 text-sm font-medium mb-1">⏰ 자동 운동 시작 기능</p>
        <p className="text-gray-400 text-xs">
          예정된 시간 1분 전에 브라우저 알림이 발송됩니다. 알림을 클릭하면 바로 운동 페이지로 이동하여 웹캠이 자동으로 켜집니다.
        </p>
      </div>
    </div>
  );
}
