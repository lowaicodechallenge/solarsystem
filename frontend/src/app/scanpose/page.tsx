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
  return kst.toUTCString().slice(0, 16);
}

function IssueTag({ issue }: { issue: { severity: string; message: string } }) {
  const cls =
    issue.severity === "error"
      ? "bg-[#ffb4ab]/15 border-[#ffb4ab]/40 text-[#ffb4ab]"
      : issue.severity === "warning"
      ? "bg-amber-400/15 border-amber-400/40 text-amber-300"
      : "bg-[#00e293]/15 border-[#00e293]/40 text-[#00e293]";
  return (
    <div className={`flex items-start gap-2 px-3 py-2 border rounded-lg text-xs ${cls}`}>
      <span className="shrink-0 mt-px">
        {issue.severity === "error" ? "●" : issue.severity === "warning" ? "◑" : "○"}
      </span>
      <span>{issue.message}</span>
    </div>
  );
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
          const existingPrev = localStorage.getItem("fitai_posture_previous");
          let shouldOverwrite = true;
          if (existingPrev) {
            try {
              const prevParsed: PostureAnalysis = JSON.parse(existingPrev);
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
    <div className="min-h-screen bg-[#050505] px-5 pb-10">
      {/* Header */}
      <div className="flex flex-row justify-between items-center py-6 gap-4">
        <div>
          <h1 className="font-oswald text-3xl font-bold text-[#e5e2e1] uppercase tracking-tight">
            자세 분석
          </h1>
          <p className="text-sm text-[#c7c4da]/50 mt-1">
            AI 웹캠으로 실시간 자세를 분석하고 교정하세요
          </p>
        </div>
        <div className="glass-card flex items-center gap-3 px-4 py-3 shrink-0">
          <span
            className="material-symbols-outlined text-[#c3c0ff]"
            style={{ fontVariationSettings: "'FILL' 1", fontSize: "20px" }}
          >
            verified_user
          </span>
          <div>
            <p className="text-[10px] text-[#c7c4da]/40 uppercase tracking-wider">평균 자세</p>
            <p className="text-2xl font-bold text-[#c3c0ff] leading-none mt-0.5">
              {history.length > 0 ? avgScore.toFixed(0) : "--"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* CTA Banner */}
        <div
          className="relative rounded-2xl p-6 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #1d00a5, #4a3aff 60%, #552ba0)" }}
        >
          <div className="scan-line" />
          <div className="relative z-10 flex flex-col justify-between min-h-[200px]">
            <div className="flex flex-col gap-2">
              <div className="bg-white/10 w-12 h-12 flex items-center justify-center rounded-xl backdrop-blur-sm mb-1">
                <span
                  className="material-symbols-outlined text-[#c3c0ff]"
                  style={{ fontSize: "28px", fontVariationSettings: "'FILL' 1" }}
                >
                  accessibility_new
                </span>
              </div>
              <h2 className="font-oswald text-3xl font-bold text-white uppercase tracking-tight">
                Measure My Posture
              </h2>
              <p className="text-sm text-white/70 max-w-xs">
                AI 웹캠 자세 분석으로 정확한 자세를 교정하며 홈트를 시작하세요.
              </p>
            </div>
            <Link
              href="/scanpose/scan"
              className="mt-6 w-fit px-8 py-3 rounded-xl text-sm font-bold text-[#050505] bg-[#c3c0ff] hover:bg-white transition-colors inline-block"
            >
              내 자세 분석하기
            </Link>
          </div>
          <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
            <span className="material-symbols-outlined" style={{ fontSize: "200px" }}>
              accessibility_new
            </span>
          </div>
        </div>

        {/* Two panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Previous Posture */}
          <div className="glass-card p-5 flex flex-col gap-4 min-h-[360px]">
            <div className="flex items-baseline gap-2">
              <h3 className="font-oswald text-xl font-bold text-[#c3c0ff] uppercase">
                Previous Posture
              </h3>
              {previousAnalysis && (
                <span className="text-[10px] text-[#c7c4da]/30">{previousAnalysis.date}</span>
              )}
            </div>

            {previousAnalysis ? (
              <div className="flex flex-col gap-3">
                {previousAnalysis.front && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] font-semibold text-[#c3c0ff]/60 uppercase tracking-widest">
                      정면 분석
                    </p>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-2xl font-bold"
                        style={{ color: getScoreColor(previousAnalysis.front.score) }}
                      >
                        {previousAnalysis.front.score.toFixed(0)}점
                      </span>
                      <span className="text-xs text-[#c7c4da]/40">
                        {getScoreLabel(previousAnalysis.front.score)}
                      </span>
                    </div>
                    {previousAnalysis.front.issues.map((issue, i) => (
                      <IssueTag key={i} issue={issue} />
                    ))}
                  </div>
                )}

                {previousAnalysis.front && previousAnalysis.side && (
                  <div className="border-t border-white/5" />
                )}

                {previousAnalysis.side && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] font-semibold text-[#c3c0ff]/60 uppercase tracking-widest">
                      측면 분석
                    </p>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-2xl font-bold"
                        style={{ color: getScoreColor(previousAnalysis.side.score) }}
                      >
                        {previousAnalysis.side.score.toFixed(0)}점
                      </span>
                      <span className="text-xs text-[#c7c4da]/40">
                        {getScoreLabel(previousAnalysis.side.score)}
                      </span>
                    </div>
                    {previousAnalysis.side.issues.map((issue, i) => (
                      <IssueTag key={i} issue={issue} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <span
                    className="material-symbols-outlined block mb-2 text-[#c3c0ff]/20"
                    style={{ fontSize: "40px" }}
                  >
                    history
                  </span>
                  <p className="text-sm text-[#c7c4da]/40">이전 분석 결과가 없습니다</p>
                  <p className="text-xs text-[#c7c4da]/25 mt-1">
                    오늘 자세를 찍으면 내일 여기에 표시됩니다.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right: Current Posture */}
          <div className="glass-card p-5 flex flex-col gap-4 min-h-[360px]">
            <h3 className="font-oswald text-xl font-bold text-[#c3c0ff] uppercase">
              Current Posture
            </h3>

            {todayAnalysis ? (
              <div className="flex flex-col gap-3">
                {todayAnalysis.front && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] font-semibold text-[#c3c0ff]/60 uppercase tracking-widest">
                      정면 분석
                    </p>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-2xl font-bold"
                        style={{ color: getScoreColor(todayAnalysis.front.score) }}
                      >
                        {todayAnalysis.front.score.toFixed(0)}점
                      </span>
                      <span className="text-xs text-[#c7c4da]/40">
                        {getScoreLabel(todayAnalysis.front.score)}
                      </span>
                    </div>
                    {todayAnalysis.front.issues.map((issue, i) => (
                      <IssueTag key={i} issue={issue} />
                    ))}
                  </div>
                )}

                <div className="border-t border-white/5" />

                {todayAnalysis.side && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] font-semibold text-[#c3c0ff]/60 uppercase tracking-widest">
                      측면 분석
                    </p>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-2xl font-bold"
                        style={{ color: getScoreColor(todayAnalysis.side.score) }}
                      >
                        {todayAnalysis.side.score.toFixed(0)}점
                      </span>
                      <span className="text-xs text-[#c7c4da]/40">
                        {getScoreLabel(todayAnalysis.side.score)}
                      </span>
                    </div>
                    {todayAnalysis.side.issues.map((issue, i) => (
                      <IssueTag key={i} issue={issue} />
                    ))}
                  </div>
                )}

                <Link
                  href="/scanpose/scan"
                  className="mt-auto text-center text-xs text-[#c3c0ff]/50 hover:text-[#c3c0ff] transition-colors"
                >
                  다시 분석하기 →
                </Link>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <span
                    className="material-symbols-outlined block mb-3 text-[#c3c0ff]/20"
                    style={{ fontSize: "52px" }}
                  >
                    today
                  </span>
                  <p className="text-sm text-[#c7c4da]/40">
                    오늘은 아직 자세 분석을 하지 않았어요.
                  </p>
                  <Link
                    href="/scanpose/scan"
                    className="mt-3 inline-block text-xs text-[#c3c0ff]/60 hover:text-[#c3c0ff] transition-colors"
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
    <Suspense
      fallback={
        <div className="p-8 text-center text-[#c7c4da]/40">로딩 중...</div>
      }
    >
      <WorkoutPageInner />
    </Suspense>
  );
}
