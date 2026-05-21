"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, type WeeklyReportResult, type ProcessDocumentResult } from "@/lib/api";
import { USER_ID, EXERCISES, getScoreColor, getScoreLabel } from "@/lib/utils";

export default function ReportPage() {
  const [data, setData] = useState<WeeklyReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sent" | "error">("idle");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);

    let symptoms = "";
    let riskTags: string[] = [];
    let postureScores: { front?: number; side?: number } = {};
    let gcalSessionCount = 0;
    try {
      symptoms = localStorage.getItem("fitai_symptoms") ?? "";
      const docsRaw = localStorage.getItem("fitai_health_documents");
      if (docsRaw) {
        const docs: ProcessDocumentResult[] = JSON.parse(docsRaw);
        riskTags = [...new Set(docs.flatMap((d) => d.risk_tags ?? []))];
      }
      const poseRaw = localStorage.getItem("fitai_posture_analysis");
      if (poseRaw) {
        const p = JSON.parse(poseRaw);
        postureScores = {
          front: p.front?.score ? Math.round(p.front.score) : undefined,
          side: p.side?.score ? Math.round(p.side.score) : undefined,
        };
      }
      const gcalToken = localStorage.getItem("gcal_access_token");
      if (gcalToken) {
        const timeMin = new Date();
        timeMin.setDate(timeMin.getDate() - 6);
        timeMin.setHours(0, 0, 0, 0);
        const r = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin.toISOString())}&timeMax=${encodeURIComponent(new Date().toISOString())}&singleEvents=true&maxResults=100&q=${encodeURIComponent("솔메이트")}`,
          { headers: { Authorization: `Bearer ${gcalToken}` } }
        );
        if (r.ok) {
          const data = await r.json();
          gcalSessionCount = (data.items ?? []).length;
        } else if (r.status === 401) {
          localStorage.removeItem("gcal_access_token");
        }
      }
    } catch {}

    try {
      const res = await api.getWeeklyReport({
        user_id: USER_ID,
        period_days: 7,
        symptoms,
        risk_tags: riskTags,
        posture_scores: postureScores,
        gcal_session_count: gcalSessionCount,
      });
      setData(res);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exName = (type: string) => EXERCISES.find((e) => e.id === type)?.name ?? type;
  const exEmoji = (type: string) => EXERCISES.find((e) => e.id === type)?.emoji ?? "💪";

  const stats = data?.stats;
  const report = data?.report;
  const trendIcon =
    stats?.score_trend === "상승" ? "trending_up"
    : stats?.score_trend === "하락" ? "trending_down"
    : "trending_flat";
  const trendColor =
    stats?.score_trend === "상승" ? "#00e293"
    : stats?.score_trend === "하락" ? "#ffb4ab"
    : "#c7c4da";

  return (
    <div className="min-h-screen px-5 pb-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-6 mb-6">
        <div>
          <p className="text-[#c3c0ff] text-xs font-semibold uppercase tracking-widest mb-1">Weekly Report</p>
          <h2 className="font-oswald text-4xl font-bold text-[#e5e2e1]">주간 리포트</h2>
          <p className="text-[#c7c4da] text-xs mt-1">최근 7일간의 운동·자세 데이터를 AI가 분석했습니다.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-[#4a3aff] hover:bg-[#5c4dff] text-white text-xs font-bold px-5 py-2.5 rounded-xl uppercase tracking-wider transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
            {loading ? "hourglass_top" : "refresh"}
          </span>
          {loading ? "분석 중..." : "다시 생성"}
        </button>
      </div>

      {loading ? (
        <div className="glass-card rounded-xl p-12 text-center text-[#c7c4da]">
          <span className="material-symbols-outlined animate-spin block mb-3 text-[#c3c0ff]" style={{ fontSize: "36px" }}>
            progress_activity
          </span>
          AI가 이번 주 데이터를 분석하고 있습니다...
        </div>
      ) : error ? (
        <div className="glass-card rounded-xl p-12 text-center text-[#c7c4da]">
          <span className="material-symbols-outlined block mb-3 text-white/20" style={{ fontSize: "36px" }}>cloud_off</span>
          리포트를 불러오지 못했습니다. 백엔드 서버를 확인해주세요.
        </div>
      ) : stats && report ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">

          {/* Headline */}
          <div className="md:col-span-12 rounded-xl p-6 relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #1d00a5, #4a3aff 60%, #552ba0)" }}>
            <div className="relative z-10">
              <p className="text-[#dad7ff] text-[10px] uppercase tracking-widest font-semibold mb-2">This Week</p>
              <h3 className="font-oswald text-2xl md:text-3xl font-bold text-white leading-snug">
                {report.headline}
              </h3>
            </div>
            <div className="absolute -right-12 -bottom-12 w-56 h-56 bg-[#00e293]/15 blur-[80px] rounded-full pointer-events-none" />
          </div>

          {/* Stat tiles */}
          <div className="md:col-span-3 glass-card rounded-xl p-5 flex flex-col items-center justify-center text-center">
            <p className="text-[#c7c4da] text-[10px] uppercase tracking-widest mb-2 font-semibold">운동 횟수</p>
            <p className="font-oswald text-5xl font-bold text-[#e5e2e1]">{stats.session_count + (stats.gcal_session_count ?? 0)}</p>
            <p className="text-[#c7c4da] text-[10px] mt-1">최근 {stats.period_days}일</p>
          </div>
          <div className="md:col-span-3 glass-card rounded-xl p-5 flex flex-col items-center justify-center text-center">
            <p className="text-[#c7c4da] text-[10px] uppercase tracking-widest mb-2 font-semibold">평균 점수</p>
            <p className="font-oswald text-5xl font-bold" style={{ color: getScoreColor(stats.avg_score) }}>
              {stats.session_count > 0 ? stats.avg_score.toFixed(0) : "--"}
            </p>
            <p className="text-[10px] mt-1" style={{ color: getScoreColor(stats.avg_score) }}>
              {stats.session_count > 0 ? getScoreLabel(stats.avg_score) : ""}
            </p>
          </div>
          <div className="md:col-span-3 glass-card rounded-xl p-5 flex flex-col items-center justify-center text-center">
            <p className="text-[#c7c4da] text-[10px] uppercase tracking-widest mb-2 font-semibold">점수 추세</p>
            <span className="material-symbols-outlined" style={{ fontSize: "44px", color: trendColor }}>
              {trendIcon}
            </span>
            <p className="text-xs mt-1 font-semibold" style={{ color: trendColor }}>{stats.score_trend}</p>
          </div>
          <div className="md:col-span-3 glass-card rounded-xl p-5 flex flex-col items-center justify-center text-center">
            <p className="text-[#c7c4da] text-[10px] uppercase tracking-widest mb-2 font-semibold">최고 / 최저</p>
            <p className="font-oswald text-3xl font-bold text-[#e5e2e1]">
              {stats.session_count > 0 ? `${stats.best_score.toFixed(0)} / ${stats.worst_score.toFixed(0)}` : "-- / --"}
            </p>
          </div>

          {/* Summary */}
          <div className="md:col-span-8 glass-card rounded-xl p-6">
            <h4 className="text-[#e5e2e1] text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#c3c0ff]" style={{ fontSize: "18px" }}>summarize</span>
              종합 평가
            </h4>
            <p className="text-sm text-[#c7c4da] leading-relaxed">{report.summary}</p>

            {report.caution && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-[#93000a]/30 border border-[#ffb4ab]/20">
                <span className="material-symbols-outlined text-[#ffb4ab] shrink-0" style={{ fontSize: "18px" }}>
                  health_and_safety
                </span>
                <p className="text-xs text-[#ffb4ab] leading-relaxed">{report.caution}</p>
              </div>
            )}
          </div>

          {/* Exercise breakdown */}
          <div className="md:col-span-4 glass-card rounded-xl p-6">
            <h4 className="text-[#e5e2e1] text-xs font-bold uppercase tracking-widest mb-4">운동 종류</h4>
            {Object.keys(stats.exercise_breakdown).length > 0 ? (
              <div className="space-y-2.5">
                {Object.entries(stats.exercise_breakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center gap-3">
                      <span className="text-lg">{exEmoji(type)}</span>
                      <span className="flex-1 text-xs text-[#e5e2e1]">{exName(type)}</span>
                      <span className="font-oswald text-lg text-[#c3c0ff]">{count}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-xs text-[#c7c4da] py-4 text-center">기록된 운동이 없습니다</p>
            )}
          </div>

          {/* Achievements / Improvements / Focus */}
          <div className="md:col-span-4 glass-card rounded-xl p-6">
            <h4 className="text-[#00e293] text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>military_tech</span>
              잘한 점
            </h4>
            <ul className="space-y-2">
              {report.achievements.length > 0 ? report.achievements.map((a, i) => (
                <li key={i} className="text-xs text-[#c7c4da] flex gap-2">
                  <span className="text-[#00e293]">✓</span><span>{a}</span>
                </li>
              )) : <li className="text-xs text-[#c7c4da]/50">아직 데이터가 부족합니다</li>}
            </ul>
          </div>
          <div className="md:col-span-4 glass-card rounded-xl p-6">
            <h4 className="text-[#ffb4ab] text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>construction</span>
              개선할 점
            </h4>
            <ul className="space-y-2">
              {report.improvements.map((a, i) => (
                <li key={i} className="text-xs text-[#c7c4da] flex gap-2">
                  <span className="text-[#ffb4ab]">!</span><span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-4 glass-card rounded-xl p-6">
            <h4 className="text-[#c3c0ff] text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>target</span>
              다음 주 집중
            </h4>
            <ul className="space-y-2">
              {report.next_week_focus.map((a, i) => (
                <li key={i} className="text-xs text-[#c7c4da] flex gap-2">
                  <span className="text-[#c3c0ff]">→</span><span>{a}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-12 glass-card rounded-xl p-5">
            <h4 className="text-[#e5e2e1] text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#c3c0ff]" style={{ fontSize: "18px" }}>mail</span>
              리포트 메일로 받기
            </h4>
            <div className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => { setEmailInput(e.target.value); setEmailStatus("idle"); }}
                placeholder="이메일 주소 입력"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-[#e5e2e1] placeholder:text-[#c7c4da]/30 focus:outline-none focus:border-[#c3c0ff]/50"
              />
              <button
                disabled={sendingEmail || !emailInput}
                onClick={async () => {
                  if (!data) return;
                  setSendingEmail(true);
                  setEmailStatus("idle");
                  try {
                    await api.sendReportEmail({
                      email: emailInput,
                      stats: data.stats,
                      report: data.report,
                      generated_at: data.generated_at,
                    });
                    setEmailStatus("sent");
                  } catch {
                    setEmailStatus("error");
                  }
                  setSendingEmail(false);
                }}
                className="inline-flex items-center gap-2 bg-[#4a3aff] hover:bg-[#5c4dff] disabled:opacity-40 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                  {sendingEmail ? "hourglass_top" : "send"}
                </span>
                {sendingEmail ? "발송 중..." : "보내기"}
              </button>
            </div>
            {emailStatus === "sent" && (
              <p className="mt-2 text-xs text-[#00e293]">✓ 메일이 발송되었습니다.</p>
            )}
            {emailStatus === "error" && (
              <p className="mt-2 text-xs text-[#ffb4ab]">발송에 실패했습니다. 백엔드 SMTP 설정을 확인해주세요.</p>
            )}
          </div>

          <div className="md:col-span-12 flex items-center justify-between pt-1">
            <p className="text-[10px] text-[#c7c4da]/40">
              생성 시각: {new Date(data.generated_at).toLocaleString("ko-KR")}
            </p>
            <Link href="/scanpose" className="text-xs text-[#c3c0ff] hover:underline">
              자세 스캔하러 가기 →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
