"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { api, type ProcessDocumentResult } from "@/lib/api";
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

type GCalEvent = {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
};

export default function Home() {
  const [history, setHistory] = useState<Session[]>([]);
  const [upcoming, setUpcoming] = useState<ScheduledWorkout[]>([]);
  const [gcalEvents, setGcalEvents] = useState<GCalEvent[]>([]);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalLastWorkout, setGcalLastWorkout] = useState<GCalEvent | null>(null);
  const [gcalTotalCount, setGcalTotalCount] = useState(0);
  const [postureAnalysis, setPostureAnalysis] = useState<{
    date: string;
    front: { score: number } | null;
    side: { score: number } | null;
  } | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [symptomsInput, setSymptomsInput] = useState("");
  const [savingSymptoms, setSavingSymptoms] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [docResults, setDocResults] = useState<ProcessDocumentResult[]>([]);
  const [lastDocData, setLastDocData] = useState<ProcessDocumentResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const CATEGORY_LABELS: Record<string, string> = {
    inbody: "인바디",
    national_fitness_100: "국민체력100",
    rehabilitation_guide: "재활치료지",
    health_checkup: "건강검진표",
    other: "기타",
  };

  const RISK_TAG_LABELS: Record<string, string> = {
    avoid_jump: "점프 금지",
    avoid_high_intensity: "고강도 금지",
    avoid_spinal_flexion_load: "척추 굴곡 부하 금지",
    avoid_knee_stress: "무릎 부하 금지",
    low_intensity_only: "저강도만 가능",
    rehabilitation_phase: "재활 단계",
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const allowed = Array.from(files).filter((f) =>
      ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(f.type)
    );
    setUploadedFiles((prev) => [...prev, ...allowed]);
  };

  useEffect(() => {
    api.getPoseHistory(USER_ID).then((res) => setHistory(Array.isArray(res) ? res : [])).catch(() => {});
    api.getUpcoming(USER_ID).then((res) => setUpcoming(Array.isArray(res) ? res : [])).catch(() => {});

    const gcalToken = localStorage.getItem("gcal_access_token");
    if (gcalToken) {
      setGcalConnected(true);
      const timeMin = encodeURIComponent(new Date().toISOString());
      fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&maxResults=5&orderBy=startTime&singleEvents=true&q=${encodeURIComponent("솔메이트")}`,
        { headers: { Authorization: `Bearer ${gcalToken}` } }
      )
        .then((r) => {
          if (r.status === 401) { localStorage.removeItem("gcal_access_token"); setGcalConnected(false); return { items: [] }; }
          return r.json();
        })
        .then((data) => setGcalEvents(data.items ?? []))
        .catch(() => {});

      const oneYearAgo = encodeURIComponent(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString());
      const now = encodeURIComponent(new Date().toISOString());
      fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${oneYearAgo}&timeMax=${now}&maxResults=100&orderBy=startTime&singleEvents=true&q=${encodeURIComponent("솔메이트")}`,
        { headers: { Authorization: `Bearer ${gcalToken}` } }
      )
        .then((r) => (r.status === 401 ? { items: [] } : r.json()))
        .then((data) => {
          const items: GCalEvent[] = data.items ?? [];
          setGcalTotalCount(items.length);
          setGcalLastWorkout(items[items.length - 1] ?? null);
        })
        .catch(() => {});
    }

    const saved = localStorage.getItem("fitai_symptoms");
    if (saved) { setSymptoms(saved); setSymptomsInput(saved); }

    try {
      const raw = localStorage.getItem("fitai_posture_analysis");
      if (raw) setPostureAnalysis(JSON.parse(raw));
    } catch {}

    try {
      const lastDocRaw = localStorage.getItem("fitai_last_document");
      if (lastDocRaw) setLastDocData(JSON.parse(lastDocRaw));
    } catch {}

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const clearSymptoms = () => {
    localStorage.removeItem("fitai_symptoms");
    setSymptoms("");
    setSymptomsInput("");
  };

  const clearLastDoc = () => {
    localStorage.removeItem("fitai_last_document");
    setLastDocData(null);
  };

  const saveSymptoms = async () => {
    setSavingSymptoms(true);
    await api.updateSymptoms(USER_ID, symptomsInput).catch(() => {});
    localStorage.setItem("fitai_symptoms", symptomsInput);
    setSymptoms(symptomsInput);

    if (uploadedFiles.length > 0) {
      const results: ProcessDocumentResult[] = [];
      for (const file of uploadedFiles) {
        try {
          const result = await api.processDocument(file);
          results.push(result);
          localStorage.setItem("fitai_last_document", JSON.stringify(result));
        } catch {}
      }
      try {
        const existing: ProcessDocumentResult[] = JSON.parse(localStorage.getItem("fitai_health_documents") ?? "[]");
        localStorage.setItem("fitai_health_documents", JSON.stringify([...existing, ...results].slice(-10)));
      } catch {}
      setDocResults(results);
      setUploadedFiles([]);
    }

    setSavingSymptoms(false);
  };

  const lastSession = history[0];
  const avgScore = history.length > 0 ? history.reduce((a, b) => a + b.avg_score, 0) / history.length : 0;
  const chartBars = history.slice(0, 6).reverse().map((s) => s.avg_score);
  const chartLabels = history.slice(0, 6).reverse().map((s) => format(new Date(s.created_at), "M/d"));

  const scores = postureAnalysis
    ? [postureAnalysis.front?.score, postureAnalysis.side?.score].filter((s): s is number => s !== undefined)
    : [];
  const avgAnalysis = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const ringR = 70;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = avgAnalysis !== null ? ringC * (1 - avgAnalysis / 100) : ringC;

  const exName = (type: string) => EXERCISES.find((e) => e.id === type)?.name ?? type;
  const exEmoji = (type: string) => EXERCISES.find((e) => e.id === type)?.emoji ?? "💪";

  return (
    <div className="min-h-screen px-5 pb-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-6 mb-6">
        <div>
          <p className="text-[#c3c0ff] text-xs font-semibold uppercase tracking-widest mb-1">Welcome Back</p>
          <div className="flex items-center gap-3">
            <h2 className="font-oswald text-4xl font-bold text-[#e5e2e1]">안녕하세요!</h2>
            <img src="/images/solfriend.png" alt="solfriend" className="h-14 w-auto object-contain" />
          </div>
        </div>
        <div className="flex items-center gap-3 bg-[#4a3aff]/20 px-5 py-2.5 rounded-xl border border-[#c3c0ff]/20 glow-primary">
          <span className="text-[#c7c4da] text-xs font-semibold">Average Posture Score</span>
          <span className="font-oswald text-3xl text-[#c3c0ff]">
            {history.length > 0 ? avgScore.toFixed(0) : "--"}
          </span>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">

        {/* Hero CTA */}
        <div className="md:col-span-8 rounded-xl p-6 relative overflow-hidden group cursor-pointer"
          style={{ background: "linear-gradient(135deg, #1d00a5, #4a3aff 60%, #552ba0)" }}>
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h3 className="font-oswald text-5xl font-bold text-white mb-3 leading-tight uppercase">
                START<br/>WORKOUT
              </h3>
              <p className="text-[#dad7ff] text-sm mb-6 max-w-xs">
                AI 자세 분석으로 정확한 자세를 교정하며 홈트를 시작하세요.
              </p>
              <Link
                href="/scanpose"
                className="inline-flex items-center gap-2 bg-white text-[#4a3aff] font-bold text-xs px-8 py-3 rounded-full hover:scale-105 active:scale-95 transition-transform uppercase tracking-wider"
              >
                Launch Scan
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>rocket_launch</span>
              </Link>
            </div>
            <span className="material-symbols-outlined text-white/20 group-hover:scale-110 group-hover:rotate-12 transition-all duration-500 hidden md:block"
              style={{ fontSize: "140px", fontVariationSettings: "'FILL' 1" }}>
              fitness_center
            </span>
          </div>
          <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-[#00e293]/15 blur-[80px] rounded-full group-hover:scale-150 transition-transform duration-700 pointer-events-none" />
        </div>

        {/* LAST ANALYSIS */}
        <div className="md:col-span-4 glass-card rounded-xl p-6 flex flex-col items-center justify-center text-center">
          <p className="text-[#c7c4da] text-[10px] uppercase tracking-widest mb-4 font-semibold">Last Analysis</p>
          <div className="relative w-36 h-36 flex items-center justify-center mb-4">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r={ringR} stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="transparent" />
              <circle cx="80" cy="80" r={ringR} stroke="#c3c0ff" strokeWidth="8" fill="transparent"
                strokeDasharray={ringC} strokeDashoffset={ringOffset} strokeLinecap="round" />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="font-oswald text-4xl font-bold text-[#e5e2e1]">{avgAnalysis ?? (lastSession ? Math.round(lastSession.avg_score) : "--")}</span>
              <span className="text-[10px] text-[#00e293] font-semibold uppercase">
                {avgAnalysis !== null ? getScoreLabel(avgAnalysis) : lastSession ? getScoreLabel(lastSession.avg_score) : ""}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="bg-white/5 p-2.5 rounded-lg border border-white/5 text-center">
              <p className="text-[#c7c4da] text-[10px] mb-0.5">Front</p>
              <p className="font-oswald text-xl text-[#e5e2e1]">
                {postureAnalysis?.front ? Math.round(postureAnalysis.front.score) : "--"}
              </p>
            </div>
            <div className="bg-white/5 p-2.5 rounded-lg border border-white/5 text-center">
              <p className="text-[#c7c4da] text-[10px] mb-0.5">Side</p>
              <p className="font-oswald text-xl text-[#e5e2e1]">
                {postureAnalysis?.side ? Math.round(postureAnalysis.side.score) : "--"}
              </p>
            </div>
          </div>
          <p className="mt-4 text-[#c7c4da] text-xs">
            총 <span className="text-[#e5e2e1] font-bold">{history.length}회</span> 운동 완료
          </p>
        </div>

        {/* Symptom / Document Card */}
        <div className="md:col-span-6 glass-card rounded-xl p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[#e5e2e1] text-xs font-bold uppercase tracking-widest">나의 증상/불편사항</h4>
            <span className="material-symbols-outlined text-[#c7c4da]" style={{ fontSize: "20px" }}>edit_note</span>
          </div>
          <textarea
            value={symptomsInput}
            onChange={(e) => setSymptomsInput(e.target.value)}
            className={`w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-[#e5e2e1] focus:outline-none focus:border-[#c3c0ff]/50 resize-none placeholder:text-[#c7c4da]/30 transition-all duration-300 ${docResults.length === 0 && lastDocData ? "min-h-[100px]" : "min-h-[140px]"}`}
            placeholder="현재 느껴지는 신체적 불편함이나 통증 부위를 기록해주세요..."
            rows={docResults.length === 0 && lastDocData ? 4 : 5}
          />
          {symptoms && (
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap gap-1.5 flex-1">
                {symptoms.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                  <span key={s} className="px-2.5 py-1 bg-[#4a3aff]/20 text-[#c3c0ff] border border-[#c3c0ff]/20 rounded-full text-xs">{s}</span>
                ))}
              </div>
              <button
                onClick={clearSymptoms}
                className="shrink-0 text-[10px] text-[#c7c4da]/40 hover:text-[#ffb4ab] transition-colors flex items-center gap-0.5 mt-0.5"
                title="저장된 증상 삭제"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>delete</span>
                삭제
              </button>
            </div>
          )}

          {/* File upload */}
          <div
            className={`flex items-center gap-3 py-5 px-4 border border-dashed rounded-lg cursor-pointer transition-colors ${
              isDragging ? "border-[#c3c0ff]/60 bg-[#4a3aff]/10" : "border-white/10 bg-white/[0.02] hover:border-[#c3c0ff]/30"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
          >
            <span className="material-symbols-outlined text-[#c7c4da]" style={{ fontSize: "22px" }}>upload_file</span>
            <div className="flex-1">
              <p className="text-xs font-medium text-[#e5e2e1]">임상 자료 업로드</p>
              <p className="text-[10px] text-[#c7c4da]/60">PDF, JPG, PNG, WebP</p>
            </div>
            <span className="text-[#c3c0ff] text-xs font-semibold">Browse</span>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

          {uploadedFiles.length > 0 && (
            <ul className="space-y-1">
              {uploadedFiles.map((f, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-[#e5e2e1]">
                  <span className="material-symbols-outlined text-[#c3c0ff]" style={{ fontSize: "14px" }}>
                    {f.type === "application/pdf" ? "picture_as_pdf" : "image"}
                  </span>
                  <span className="flex-1 truncate">{f.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); setUploadedFiles((prev) => prev.filter((_, j) => j !== i)); }}
                    className="text-[#c7c4da] hover:text-[#ffb4ab] transition-colors">
                    <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>close</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={saveSymptoms}
            disabled={savingSymptoms}
            className="w-full bg-[#4a3aff] hover:bg-[#5c4dff] text-white py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
              {savingSymptoms ? "hourglass_top" : "save"}
            </span>
            {savingSymptoms ? (uploadedFiles.length > 0 ? "문서 분석 중..." : "저장 중...") : "SAVE DATA"}
          </button>

          {docResults.length > 0 && (
            <div className="flex flex-col gap-2">
              {docResults.map((r, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-[#e5e2e1]">{CATEGORY_LABELS[r.document_category] ?? r.document_category}</span>
                    <span className="text-[#00e293] text-[10px] uppercase tracking-wider">분석 완료</span>
                  </div>
                  {r.risk_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.risk_tags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 bg-[#93000a]/40 text-[#ffb4ab] border border-[#ffb4ab]/20 rounded-full text-[10px]">
                          {RISK_TAG_LABELS[tag] ?? tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <Link href="/exercise" className="text-center text-xs text-[#c3c0ff] hover:underline">
                운동 추천 받으러 가기 →
              </Link>
            </div>
          )}

          {docResults.length === 0 && lastDocData && (
            <div className="flex flex-col gap-2">
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-[#e5e2e1]">{CATEGORY_LABELS[lastDocData.document_category] ?? lastDocData.document_category}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[#c7c4da] text-[10px] uppercase tracking-wider">저장된 문서</span>
                    <button
                      onClick={clearLastDoc}
                      className="text-[10px] text-[#c7c4da]/40 hover:text-[#ffb4ab] transition-colors flex items-center gap-0.5"
                      title="저장된 문서 삭제"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>delete</span>
                      삭제
                    </button>
                  </div>
                </div>
                {lastDocData.risk_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {lastDocData.risk_tags.map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 bg-[#93000a]/40 text-[#ffb4ab] border border-[#ffb4ab]/20 rounded-full text-[10px]">
                        {RISK_TAG_LABELS[tag] ?? tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Link href="/exercise" className="text-center text-xs text-[#c3c0ff] hover:underline">
                운동 추천 받으러 가기 →
              </Link>
            </div>
          )}
        </div>

        {/* Chart + Schedule */}
        <div className="md:col-span-6 flex flex-col gap-4">
          {/* Bar Chart */}
          <div className="glass-card rounded-xl p-5 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[#e5e2e1] text-xs font-bold uppercase tracking-widest">자세 기록</h4>
              <span className="text-[#c7c4da] text-[10px] uppercase tracking-wider">Weekly Progress</span>
            </div>
            {history.length > 0 ? (
              <>
                <div className="flex items-end gap-2 flex-1 min-h-[72px] pb-2 border-b border-l border-white/10">
                  {chartBars.map((score, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5" style={{ height: "100%", display: "flex", alignItems: "flex-end", flexDirection: "column", justifyContent: "flex-end" }}>
                      <div
                        className="w-full rounded-t-lg transition-all duration-300 relative group"
                        style={{ height: `${Math.max(score, 5)}%`, backgroundColor: i === chartBars.length - 1 ? "#c3c0ff" : "rgba(195,192,255,0.25)" }}
                      >
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-[10px] text-[#c3c0ff] font-bold whitespace-nowrap transition-opacity">
                          {score.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2">
                  {chartLabels.map((l, i) => (
                    <span key={i} className="text-[10px] text-[#c7c4da] flex-1 text-center">{l}</span>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-4">
                <span className="material-symbols-outlined text-white/20" style={{ fontSize: "36px" }}>accessibility_new</span>
                <p className="text-[#c7c4da] text-xs">자세를 측정해보세요</p>
                <Link href="/scanpose" className="text-[#c3c0ff] text-[10px] hover:underline">스캔 시작하기</Link>
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="glass-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h4 className="text-[#e5e2e1] text-xs font-bold uppercase tracking-widest">예정된 운동</h4>
                {gcalConnected && (
                  <span className="px-1.5 py-0.5 bg-[#006f46]/40 text-[#00e293] text-[10px] rounded-full border border-[#00e293]/20">Google Calendar</span>
                )}
              </div>
              <Link href="/calendar" className="text-[#c3c0ff] text-[10px] hover:underline">일정 관리</Link>
            </div>

            {gcalConnected ? (
              gcalEvents.length > 0 ? (
                <div className="space-y-2">
                  {gcalEvents.slice(0, 3).map((ev) => {
                    const dt = new Date(ev.start.dateTime ?? ev.start.date ?? "");
                    const isAllDay = !ev.start.dateTime;
                    return (
                      <div key={ev.id} className="flex gap-3 p-2.5 rounded-lg bg-white/5 border-l-4 border-[#4a3aff]">
                        <div className="text-center min-w-[36px]">
                          <p className="text-[9px] text-[#c7c4da]">{format(dt, "M월", { locale: ko })}</p>
                          <p className="font-oswald text-lg font-bold text-[#e5e2e1]">{format(dt, "d")}</p>
                          <p className="text-[9px] text-[#c3c0ff] font-semibold">{format(dt, "EEE", { locale: ko })}</p>
                        </div>
                        <div className="flex-1 flex flex-col justify-center">
                          <p className="text-xs font-semibold text-[#e5e2e1] line-clamp-1">{ev.summary}</p>
                          <p className="text-[10px] text-[#c7c4da]">{isAllDay ? "종일" : format(dt, "HH:mm")} · 운동</p>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-[#00e293] self-center" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4 text-[#c7c4da] text-xs">
                  <span className="material-symbols-outlined block mb-1 text-white/20" style={{ fontSize: "28px" }}>event_busy</span>
                  등록된 운동 일정이 없습니다
                  <Link href="/calendar" className="block text-[#c3c0ff] text-[10px] mt-1 hover:underline">일정 추가하기</Link>
                </div>
              )
            ) : upcoming.length > 0 ? (
              <div className="space-y-2">
                {upcoming.slice(0, 3).map((w) => {
                  const dt = new Date(w.scheduled_time);
                  return (
                    <div key={w.id} className="flex gap-3 p-2.5 rounded-lg bg-white/5 border-l-4 border-[#4a3aff]">
                      <div className="text-center min-w-[36px]">
                        <p className="text-[9px] text-[#c7c4da]">{format(dt, "M월", { locale: ko })}</p>
                        <p className="font-oswald text-lg font-bold text-[#e5e2e1]">{format(dt, "d")}</p>
                        <p className="text-[9px] text-[#c3c0ff] font-semibold">{format(dt, "EEE", { locale: ko })}</p>
                      </div>
                      <div className="flex-1 flex flex-col justify-center">
                        <p className="text-xs font-semibold text-[#e5e2e1]">{exEmoji(w.exercise_type)} {exName(w.exercise_type)}</p>
                        <p className="text-[10px] text-[#c7c4da]">{format(dt, "HH:mm")} · 홈 운동</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4 text-[#c7c4da] text-xs">
                <span className="material-symbols-outlined block mb-1 text-white/20" style={{ fontSize: "28px" }}>event_busy</span>
                예정된 운동이 없습니다
                <Link href="/calendar" className="block text-[#c3c0ff] text-[10px] mt-1 hover:underline">일정 추가하기</Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="md:col-span-12 glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[#e5e2e1] text-xs font-bold uppercase tracking-widest">Recent Activity</h4>
            {gcalConnected && <span className="px-1.5 py-0.5 bg-[#006f46]/40 text-[#00e293] text-[10px] rounded-full border border-[#00e293]/20">Google Calendar</span>}
          </div>

          {gcalConnected ? (
            gcalLastWorkout ? (
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[#006f46]/10 border border-[#00e293]/20">
                <div className="w-11 h-11 rounded-lg bg-[#006f46]/20 flex items-center justify-center text-xl shrink-0">🏋️</div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h4 className="text-xs font-bold text-[#e5e2e1]">{gcalLastWorkout.summary}</h4>
                    <span className="text-[10px] text-[#c7c4da]">
                      {format(new Date(gcalLastWorkout.start.dateTime ?? gcalLastWorkout.start.date ?? ""), "M.d HH:mm")}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#00e293] mt-0.5">
                    {format(new Date(gcalLastWorkout.start.dateTime ?? gcalLastWorkout.start.date ?? ""), "EEE요일", { locale: ko })} · Google Calendar
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-[#c7c4da] text-sm">
                <span className="material-symbols-outlined block mb-2 text-white/20" style={{ fontSize: "36px" }}>fitness_center</span>
                아직 완료된 운동이 없습니다
              </div>
            )
          ) : history.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {history.slice(0, 4).map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] transition-colors group border border-white/5">
                  <div className="w-10 h-10 rounded-lg bg-[#4a3aff]/20 flex items-center justify-center text-lg shrink-0">
                    {exEmoji(s.exercise_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#e5e2e1] truncate">{exName(s.exercise_type)}</p>
                    <p className="text-[10px] text-[#c7c4da]">{format(new Date(s.created_at), "M.d HH:mm")}</p>
                  </div>
                  <span className="font-oswald text-2xl font-bold text-[#c3c0ff] group-hover:scale-110 transition-transform">
                    {s.avg_score.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-[#c7c4da] text-sm">
              <span className="material-symbols-outlined block mb-2 text-white/20" style={{ fontSize: "36px" }}>fitness_center</span>
              아직 운동 기록이 없습니다
              <Link href="/exercise" className="block text-[#c3c0ff] text-xs mt-1 hover:underline">첫 운동 시작하기</Link>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-white/5 text-center">
            {gcalConnected ? (
              <span className="text-xs text-[#c7c4da]">
                총 <span className="font-bold text-[#e5e2e1]">{gcalTotalCount}</span>회 운동 완료
                {gcalTotalCount === 100 && "+"}
              </span>
            ) : (
              <Link href="/calendar" className="text-xs text-[#c7c4da] hover:text-[#c3c0ff] transition-colors">
                캘린더를 연동하고 운동 기록을 확인하세요 →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* FAB */}
      <div className="fixed bottom-24 right-5 z-50">
        <Link href="/scanpose"
          className="flex items-center gap-2 bg-gradient-to-tr from-[#4a3aff] to-[#d2bbff] text-white px-5 py-3.5 rounded-full shadow-[0_0_20px_rgba(74,58,255,0.5)] hover:scale-105 active:scale-95 transition-transform relative"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>add_a_photo</span>
          <span className="text-xs font-bold">Start Scan</span>
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00e293] opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#00e293]" />
          </span>
        </Link>
      </div>
    </div>
  );
}
