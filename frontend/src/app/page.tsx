"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { EXERCISES, getScoreColor, getScoreLabel, USER_ID } from "@/lib/utils";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

type Session = {
  id: string;
  exercise_type: string;
  avg_score: number;
  created_at: string;
};

type ScheduledWorkout = {
  id: string;
  exercise_type: string;
  scheduled_time: string;
};

export default function Home() {
  const [history, setHistory] = useState<Session[]>([]);
  const [upcoming, setUpcoming] = useState<ScheduledWorkout[]>([]);
  const [symptoms, setSymptoms] = useState("");
  const [symptomsInput, setSymptomsInput] = useState("");
  const [savingSymptoms, setSavingSymptoms] = useState(false);

  useEffect(() => {
    api.getPoseHistory(USER_ID).then((res) => setHistory(Array.isArray(res) ? res : [])).catch(() => {});
    api.getUpcoming(USER_ID).then((res) => setUpcoming(Array.isArray(res) ? res : [])).catch(() => {});

    const saved = localStorage.getItem("fitai_symptoms");
    if (saved) { setSymptoms(saved); setSymptomsInput(saved); }

    // Browser notification permission
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Check for upcoming workout (auto-webcam trigger)
    checkUpcomingWorkout();
  }, []);

  const checkUpcomingWorkout = async () => {
    const list = await api.getUpcoming(USER_ID).catch(() => []) as ScheduledWorkout[];
    if (!list.length) return;
    const now = new Date();
    for (const w of list) {
      const dt = new Date(w.scheduled_time);
      const diffMs = dt.getTime() - now.getTime();
      const diffMin = diffMs / 60000;
      if (diffMin > 0 && diffMin <= 1) {
        const exName = EXERCISES.find((e) => e.id === w.exercise_type)?.name ?? w.exercise_type;
        if (Notification.permission === "granted") {
          new Notification("🏋️ FitAI 운동 시간!", {
            body: `${exName} 운동을 시작할 시간입니다! 클릭하면 바로 시작됩니다.`,
            icon: "/favicon.ico",
          });
        }
      }
    }
    setTimeout(checkUpcomingWorkout, 60000);
  };

  const saveSymptoms = async () => {
    setSavingSymptoms(true);
    await api.updateSymptoms(USER_ID, symptomsInput).catch(() => {});
    localStorage.setItem("fitai_symptoms", symptomsInput);
    setSymptoms(symptomsInput);
    setSavingSymptoms(false);
  };

  const avgScoreAllTime =
    history.length > 0 ? history.reduce((a, b) => a + b.avg_score, 0) / history.length : 0;

  const todayEx = upcoming[0];
  const exName = (type: string) => EXERCISES.find((e) => e.id === type)?.name ?? type;
  const exEmoji = (type: string) => EXERCISES.find((e) => e.id === type)?.emoji ?? "💪";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Hero */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-primary-900/60 to-dark-700 border border-primary-500/20 p-6">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary-500/10 rounded-full blur-3xl" />
        <h1 className="text-2xl font-bold text-white mb-1">
          안녕하세요! <span className="text-primary-400">FitAI</span>입니다 🏋️
        </h1>
        <p className="text-gray-400 text-sm mb-4">AI 자세 분석으로 더 효과적인 홈트를 시작하세요</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/workout"
            className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-black font-bold rounded-xl transition-all glow-green text-sm"
          >
            운동 시작하기 →
          </Link>
          <Link
            href="/battle"
            className="px-5 py-2.5 bg-dark-500 hover:bg-dark-400 text-white font-medium rounded-xl transition-all text-sm"
          >
            ⚔️ 대결하기
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{history.length}</p>
          <p className="text-xs text-gray-400 mt-1">총 운동 횟수</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: getScoreColor(avgScoreAllTime) }}>
            {avgScoreAllTime.toFixed(0)}
          </p>
          <p className="text-xs text-gray-400 mt-1">평균 자세 점수</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{upcoming.length}</p>
          <p className="text-xs text-gray-400 mt-1">예정 운동</p>
        </div>
      </div>

      {/* Symptoms input */}
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🩺</span>
          <h3 className="font-bold text-white">나의 증상/불편사항</h3>
        </div>
        <p className="text-xs text-gray-400">입력한 증상을 AI가 운동 추천에 반영합니다 (예: 편두통, 무릎 통증, 거북목)</p>
        <div className="flex gap-2">
          <input
            value={symptomsInput}
            onChange={(e) => setSymptomsInput(e.target.value)}
            placeholder="예: 편두통, 목 통증, 오른쪽 무릎 불편함"
            className="flex-1 bg-dark-600 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-primary-500/50"
          />
          <button
            onClick={saveSymptoms}
            disabled={savingSymptoms}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-black font-bold rounded-xl text-sm transition-all disabled:opacity-50"
          >
            {savingSymptoms ? "저장..." : "저장"}
          </button>
        </div>
        {symptoms && (
          <div className="flex items-center gap-2 flex-wrap">
            {symptoms.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
              <span key={s} className="px-2 py-1 bg-primary-500/20 text-primary-400 rounded-full text-xs">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Today's workout */}
      {todayEx && (
        <div className="glass-card rounded-2xl p-5">
          <h3 className="font-bold text-white mb-3">📅 다음 예정 운동</h3>
          <div className="flex items-center gap-4 p-3 bg-dark-600 rounded-xl">
            <span className="text-3xl">{exEmoji(todayEx.exercise_type)}</span>
            <div>
              <p className="font-semibold text-white">{exName(todayEx.exercise_type)}</p>
              <p className="text-sm text-gray-400">
                {format(new Date(todayEx.scheduled_time), "M월 d일 (EEEE) HH:mm", { locale: ko })}
              </p>
            </div>
            <Link
              href="/workout"
              className="ml-auto px-4 py-2 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 rounded-xl text-sm font-medium transition-all"
            >
              지금 시작
            </Link>
          </div>
        </div>
      )}

      {/* Quick access */}
      <div className="grid grid-cols-2 gap-3">
        {EXERCISES.map((ex) => (
          <Link
            key={ex.id}
            href={`/workout?exercise=${ex.id}`}
            className="glass-card rounded-2xl p-4 hover:border-primary-500/30 border border-transparent transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl group-hover:scale-110 transition-transform">{ex.emoji}</span>
              <div>
                <p className="font-semibold text-white text-sm">{ex.name}</p>
                <p className="text-xs text-gray-500">{ex.description}</p>
              </div>
            </div>
          </Link>
        ))}
        <Link
          href="/calendar"
          className="glass-card rounded-2xl p-4 hover:border-blue-500/30 border border-transparent transition-all group"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl group-hover:scale-110 transition-transform">📅</span>
            <div>
              <p className="font-semibold text-white text-sm">일정 관리</p>
              <p className="text-xs text-gray-500">Google 캘린더 연동</p>
            </div>
          </div>
        </Link>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <h3 className="font-bold text-white mb-3">최근 운동 기록</h3>
          <div className="space-y-2">
            {history.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-2.5 bg-dark-600 rounded-xl">
                <span className="text-xl">{exEmoji(s.exercise_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{exName(s.exercise_type)}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(s.created_at), "M.d HH:mm")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold" style={{ color: getScoreColor(s.avg_score) }}>
                    {s.avg_score.toFixed(0)}점
                  </p>
                  <p className="text-xs text-gray-500">{getScoreLabel(s.avg_score)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
