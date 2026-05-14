"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { USER_ID, getScoreColor, getScoreLabel } from "@/lib/utils";
import { api } from "@/lib/api";

type Session = {
  id: string;
  exercise_type: string;
  avg_score: number;
  created_at: string;
};

type CaptureResult = {
  score: number;
  issues: Array<{ severity: string; message: string }>;
};

type PostureAnalysis = {
  date: string;
  front: CaptureResult | null;
  side: CaptureResult | null;
};

function getTodayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toUTCString().slice(0, 16); // "Tue, 13 May 2026"
}

function WorkoutPageInner() {
  const [history, setHistory] = useState<Session[]>([]);
  const [todayAnalysis, setTodayAnalysis] = useState<PostureAnalysis | null>(null);
  const [previousAnalysis, setPreviousAnalysis] = useState<PostureAnalysis | null>(null);

  useEffect(() => {
    api.getPoseHistory(USER_ID)
      .then((res) => setHistory(Array.isArray(res) ? res : []))
      .catch(() => {});

    try {
      const todayKST = getTodayKST();
      const raw = localStorage.getItem("fitai_posture_analysis");
      if (raw) {
        const parsed: PostureAnalysis = JSON.parse(raw);
        if (parsed.date === todayKST) {
          setTodayAnalysis(parsed);
        } else {
          // Roll over to previous
          const existingPrev = localStorage.getItem("fitai_posture_previous");
          let shouldOverwrite = true;
          if (existingPrev) {
            try {
              const prevParsed: PostureAnalysis = JSON.parse(existingPrev);
              // Only overwrite previous if the stale current is newer than existing previous
              shouldOverwrite = prevParsed.date !== parsed.date;
            } catch {}
          }
          if (shouldOverwrite) {
            localStorage.setItem("fitai_posture_previous", raw);
          }
          localStorage.removeItem("fitai_posture_analysis");
        }
      }

      const prevRaw = localStorage.getItem("fitai_posture_previous");
      if (prevRaw) {
        setPreviousAnalysis(JSON.parse(prevRaw));
      }
    } catch {}
  }, []);

  const avgScore =
    history.length > 0
      ? history.reduce((a, b) => a + b.avg_score, 0) / history.length
      : 0;

  return (
    <div className="min-h-screen bg-[#f8f9ff] px-6 pb-10">
      {/* Header */}
      <div className="flex flex-row justify-between items-end py-6 gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[32px] font-bold text-[#000000] leading-10">자세 분석</h1>
          <p className="text-sm text-[#42484a]">AI 웹캠으로 실시간 자세를 분석하고 교정하세요</p>
        </div>
        <div className="flex items-center gap-3 bg-white border border-[#c1c7c9] px-4 py-2.5 rounded-lg shadow-sm shrink-0">
          <span
            className="material-symbols-outlined text-[#2f628c]"
            style={{ fontVariationSettings: "'FILL' 1", fontSize: "16px" }}
          >
            verified_user
          </span>
          <div>
            <p className="text-xs text-[#42484a]">평균 자세 점수</p>
            <p className="text-2xl font-semibold text-[#000000] leading-none mt-0.5">
              {history.length > 0 ? avgScore.toFixed(0) : "--"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* CTA Banner */}
        <div className="relative bg-[#9ecefd] rounded-lg p-6 overflow-hidden">
          <div className="relative z-10 flex flex-col justify-between min-h-[200px]">
            <div className="flex flex-col gap-2">
              <div className="bg-white/30 w-12 h-12 flex items-center justify-center rounded-lg backdrop-blur-sm mb-1">
                <span className="material-symbols-outlined text-[#235881]" style={{ fontSize: "28px" }}>
                  accessibility_new
                </span>
              </div>
              <h2 className="text-[32px] font-bold text-[#235881] leading-10">Measure My Posture</h2>
              <p className="text-sm text-[#235881]/80 max-w-xs">
                AI 웹캠 자세 분석으로 정확한 자세를 교정하며 홈트를 시작하세요.
              </p>
            </div>
            <Link
              href="/scanpose/scan"
              className="mt-6 bg-[#235881] text-white w-fit px-8 py-3 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity inline-block"
            >
              내 자세 분석하기!
            </Link>
          </div>
          <div className="absolute -right-8 -bottom-8 opacity-20 pointer-events-none">
            <span className="material-symbols-outlined" style={{ fontSize: "200px" }}>
              accessibility_new
            </span>
          </div>
        </div>

        {/* Two panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Previous Posture */}
          <div className="bg-white border border-[#c1c7c9] rounded-lg p-4 flex flex-col gap-4 min-h-[400px]">
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-semibold text-[#101c2a]">Previous Posture</h3>
              {previousAnalysis && (
                <span className="text-xs text-[#72787a]">{previousAnalysis.date}</span>
              )}
            </div>

            {previousAnalysis ? (
              <div className="flex flex-col gap-3">
                {previousAnalysis.front && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-[#2f628c] uppercase tracking-wider">정면 분석</p>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl font-bold" style={{ color: getScoreColor(previousAnalysis.front.score) }}>
                        {previousAnalysis.front.score.toFixed(0)}점
                      </span>
                      <span className="text-xs text-[#42484a]">{getScoreLabel(previousAnalysis.front.score)}</span>
                    </div>
                    {previousAnalysis.front.issues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2 bg-[#f8f9ff] border border-[#c1c7c9] rounded-lg text-xs text-[#101c2a]">
                        <span className="shrink-0">{issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🟢"}</span>
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {previousAnalysis.front && previousAnalysis.side && (
                  <div className="border-t border-[#c1c7c9]" />
                )}

                {previousAnalysis.side && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-[#2f628c] uppercase tracking-wider">측면 분석</p>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl font-bold" style={{ color: getScoreColor(previousAnalysis.side.score) }}>
                        {previousAnalysis.side.score.toFixed(0)}점
                      </span>
                      <span className="text-xs text-[#42484a]">{getScoreLabel(previousAnalysis.side.score)}</span>
                    </div>
                    {previousAnalysis.side.issues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2 bg-[#f8f9ff] border border-[#c1c7c9] rounded-lg text-xs text-[#101c2a]">
                        <span className="shrink-0">{issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🟢"}</span>
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <span className="material-symbols-outlined block mb-2 text-[#c1c7c9]" style={{ fontSize: "36px" }}>
                    history
                  </span>
                  <p className="text-sm text-[#42484a]">이전 분석 결과가 없습니다</p>
                  <p className="text-xs text-[#72787a] mt-1">오늘 자세를 찍으면 내일 여기에 표시됩니다.</p>
                </div>
              </div>
            )}
          </div>

          {/* Right: Current Posture */}
          <div className="bg-white border border-[#c1c7c9] rounded-lg p-4 flex flex-col gap-4 min-h-[400px]">
            <h3 className="text-2xl font-semibold text-[#101c2a]">Current Posture</h3>

            {todayAnalysis ? (
              <div className="flex flex-col gap-3">
                {/* Front result */}
                {todayAnalysis.front && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-[#2f628c] uppercase tracking-wider">정면 분석</p>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl font-bold" style={{ color: getScoreColor(todayAnalysis.front.score) }}>
                        {todayAnalysis.front.score.toFixed(0)}점
                      </span>
                      <span className="text-xs text-[#42484a]">{getScoreLabel(todayAnalysis.front.score)}</span>
                    </div>
                    {todayAnalysis.front.issues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2 bg-[#f8f9ff] border border-[#c1c7c9] rounded-lg text-xs text-[#101c2a]">
                        <span className="shrink-0">{issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🟢"}</span>
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-[#c1c7c9]" />

                {/* Side result */}
                {todayAnalysis.side && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-[#2f628c] uppercase tracking-wider">측면 분석</p>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl font-bold" style={{ color: getScoreColor(todayAnalysis.side.score) }}>
                        {todayAnalysis.side.score.toFixed(0)}점
                      </span>
                      <span className="text-xs text-[#42484a]">{getScoreLabel(todayAnalysis.side.score)}</span>
                    </div>
                    {todayAnalysis.side.issues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2 bg-[#f8f9ff] border border-[#c1c7c9] rounded-lg text-xs text-[#101c2a]">
                        <span className="shrink-0">{issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🟢"}</span>
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Link
                  href="/scanpose/scan"
                  className="mt-auto text-center text-xs text-[#2f628c] hover:underline"
                >
                  다시 분석하기 →
                </Link>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <span className="material-symbols-outlined block mb-3 text-[#c1c7c9]" style={{ fontSize: "48px" }}>
                    today
                  </span>
                  <p className="text-sm text-[#42484a]">오늘은 아직 자세 분석을 하지 않았어요.</p>
                  <Link
                    href="/scanpose/scan"
                    className="mt-3 inline-block text-xs text-[#2f628c] hover:underline"
                  >
                    지금 분석하러 가기 →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkoutPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-[#42484a]">로딩 중...</div>}>
      <WorkoutPageInner />
    </Suspense>
  );
}
