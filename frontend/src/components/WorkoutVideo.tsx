"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

type Exercise = {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  key_point: string;
};

type Routine = {
  routine_name: string;
  focus_area: string;
  total_minutes: number;
  warm_up: string[];
  main_exercises: Exercise[];
  cool_down: string[];
  personalized_note: string;
};

type Props = {
  userId: string;
  poseSummary?: string;
  postureIssues?: string[];
};

export default function WorkoutVideo({ userId, poseSummary, postureIssues }: Props) {
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeEx, setActiveEx] = useState<Exercise | null>(null);
  const [phase, setPhase] = useState<"warmup" | "main" | "cooldown">("warmup");

  const loadRoutine = async () => {
    setLoading(true);
    try {
      const res = await api.getRoutine({
        user_id: userId,
        pose_summary: poseSummary ?? "",
        posture_issues: postureIssues ?? [],
      }) as { routine: Routine };
      setRoutine(res.routine);
    } catch {
      setRoutine(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRoutine();
  }, [userId]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8 flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">AI가 맞춤 루틴을 생성하는 중...</p>
      </div>
    );
  }

  if (!routine) {
    return (
      <div className="glass-card rounded-2xl p-6 text-center">
        <p className="text-gray-400 mb-3">루틴을 불러올 수 없습니다.</p>
        <button onClick={loadRoutine} className="px-4 py-2 bg-primary-500 text-black rounded-lg text-sm font-bold">
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Routine Header */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-white">{routine.routine_name}</h2>
            <p className="text-gray-400 text-sm">{routine.focus_area} · {routine.total_minutes}분</p>
          </div>
          <button
            onClick={loadRoutine}
            className="px-3 py-1.5 text-xs bg-dark-500 hover:bg-dark-400 text-gray-300 rounded-lg transition-all"
          >
            새로 생성
          </button>
        </div>
        <div className="bg-primary-500/10 border border-primary-500/20 rounded-xl p-3 text-sm text-primary-400">
          💬 {routine.personalized_note}
        </div>
      </div>

      {/* Phase Tabs */}
      <div className="flex rounded-xl overflow-hidden border border-white/5">
        {(["warmup", "main", "cooldown"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPhase(p)}
            className={`flex-1 py-2 text-sm font-medium transition-all ${
              phase === p ? "bg-primary-500/20 text-primary-400" : "bg-dark-700 text-gray-500 hover:text-gray-300"
            }`}
          >
            {p === "warmup" ? "워밍업" : p === "main" ? "메인" : "쿨다운"}
          </button>
        ))}
      </div>

      {phase === "warmup" && (
        <div className="glass-card rounded-2xl p-4 space-y-2">
          {routine.warm_up.map((step, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-gray-300">
              <span className="w-6 h-6 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {i + 1}
              </span>
              {step}
            </div>
          ))}
        </div>
      )}

      {phase === "main" && (
        <div className="space-y-3">
          {routine.main_exercises.map((ex, i) => (
            <div
              key={i}
              className={`glass-card rounded-2xl p-4 cursor-pointer transition-all border ${
                activeEx === ex ? "border-primary-500/50 bg-primary-500/5" : "border-transparent hover:border-white/10"
              }`}
              onClick={() => setActiveEx(activeEx === ex ? null : ex)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-white">{ex.name}</span>
                  <span className="text-gray-500 text-sm ml-2">
                    {ex.sets}세트 × {ex.reps} · 휴식 {ex.rest_seconds}초
                  </span>
                </div>
                <span className="text-gray-500 text-xs">{activeEx === ex ? "▲" : "▼"}</span>
              </div>
              {activeEx === ex && (
                <div className="mt-2 pt-2 border-t border-white/5">
                  <p className="text-xs text-primary-400 font-medium">💡 핵심 포인트</p>
                  <p className="text-sm text-gray-300 mt-1">{ex.key_point}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    💪 운동 탭에서 AI 코치와 함께 자세를 따라해 보세요
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {phase === "cooldown" && (
        <div className="glass-card rounded-2xl p-4 space-y-2">
          {routine.cool_down.map((step, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-gray-300">
              <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {i + 1}
              </span>
              {step}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
