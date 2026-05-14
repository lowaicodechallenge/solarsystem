"use client";
import { useState, useEffect, useRef } from "react";
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
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const saved = localStorage.getItem("fitai_symptoms");
    if (saved) { setSymptoms(saved); setSymptomsInput(saved); }

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const saveSymptoms = async () => {
    setSavingSymptoms(true);
    await api.updateSymptoms(USER_ID, symptomsInput).catch(() => {});
    localStorage.setItem("fitai_symptoms", symptomsInput);
    setSymptoms(symptomsInput);
    setSavingSymptoms(false);
  };

  const lastSession = history[0];
  const avgScore =
    history.length > 0 ? history.reduce((a, b) => a + b.avg_score, 0) / history.length : 0;

  const chartBars =
    history.length > 0
      ? history.slice(0, 6).reverse().map((s) => s.avg_score)
      : [65, 80, 40, 90, 55, 70];
  const chartLabels =
    history.length > 0
      ? history.slice(0, 6).reverse().map((s) => format(new Date(s.created_at), "M/d"))
      : ["1회", "2회", "3회", "4회", "5회", "최근"];

  const exName = (type: string) => EXERCISES.find((e) => e.id === type)?.name ?? type;
  const exEmoji = (type: string) => EXERCISES.find((e) => e.id === type)?.emoji ?? "💪";

  return (
    <div className="min-h-screen bg-[#f8f9ff] px-6 pb-10">
      {/* Header Section */}
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4 pt-6">
        <div>
          <h1 className="text-[32px] font-bold leading-10 text-[#101c2a] mb-1">안녕하세요! 👋</h1>
          <p className="text-sm text-[#42484a]">AI 자세 분석으로 더 효과적인 홈트를 시작하세요</p>
        </div>
        <div className="flex items-center gap-3 bg-white border border-[#c1c7c9] px-4 py-3 rounded-lg shadow-sm">
          <span
            className="material-symbols-outlined text-[#2f628c]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            verified_user
          </span>
          <div>
            <p className="text-xs text-[#42484a]">평균 자세 점수</p>
            <p className="text-2xl font-bold text-[#101c2a] leading-none">
              {history.length > 0 ? avgScore.toFixed(0) : "--"}
            </p>
          </div>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* CTA: 운동 시작 */}
        <div className="col-span-12 md:col-span-6 bg-[#9ecefd] rounded-lg p-6 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
          <div className="relative z-10 flex flex-col h-full justify-between min-h-[280px]">
            <div>
              <div className="bg-white/30 w-12 h-12 flex items-center justify-center rounded-lg mb-4 backdrop-blur-sm">
                <span className="material-symbols-outlined text-[#235881]" style={{ fontSize: "32px" }}>
                  accessibility_new
                </span>
              </div>
              <h2 className="text-[32px] font-bold leading-10 text-[#101c2a] mb-2">운동 시작하기</h2>
              <p className="text-[#235881] max-w-xs text-sm mb-6">
                AI 웹캠 자세 분석으로 정확한 자세를 교정하며 홈트를 시작하세요.
              </p>
            </div>
            <Link
              href="/scanpose"
              className="bg-[#101c2a] text-[#cee5ff] w-fit px-8 py-2.5 rounded-lg text-xs font-bold hover:opacity-90 transition-opacity uppercase tracking-wider"
            >
              START WORKOUT
            </Link>
          </div>
          <div className="absolute -right-8 -bottom-8 opacity-20 group-hover:scale-110 transition-transform duration-500 pointer-events-none">
            <span className="material-symbols-outlined" style={{ fontSize: "200px" }}>
              accessibility_new
            </span>
          </div>
        </div>

        {/* Clinical Data: 증상 입력 */}
        <div className="col-span-12 md:col-span-6 bg-white border border-[#c1c7c9] rounded-lg p-6 hover:border-[#2f628c] transition-colors group">
          <div className="bg-[#2f628c]/10 w-12 h-12 flex items-center justify-center rounded-lg mb-4">
            <span className="material-symbols-outlined text-[#2f628c]" style={{ fontSize: "32px" }}>
              clinical_notes
            </span>
          </div>
          <h2 className="text-2xl font-bold text-[#101c2a] mb-2">나의 증상/불편사항</h2>
          <p className="text-[#42484a] text-sm mb-4">입력한 증상을 AI가 운동 추천에 반영합니다.</p>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#42484a] flex justify-between">
                <span>증상을 설명해 주세요</span>
                <span className="text-[10px] uppercase tracking-wider opacity-60">Optional</span>
              </label>
              <textarea
                value={symptomsInput}
                onChange={(e) => setSymptomsInput(e.target.value)}
                className="w-full bg-[#eff4ff] border border-[#c1c7c9] rounded-lg p-2.5 text-sm text-[#101c2a] focus:outline-none focus:border-[#2f628c] min-h-[100px] resize-none placeholder:text-[#72787a]"
                placeholder="예: 편두통, 목 통증, 무릎 불편함..."
                rows={3}
              />
            </div>
            {symptoms && (
              <div className="flex flex-wrap gap-1.5">
                {symptoms.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                  <span key={s} className="px-2 py-1 bg-[#cee5ff] text-[#235881] rounded-full text-xs">
                    {s}
                  </span>
                ))}
              </div>
            )}

            {/* File upload */}
            <div>
              <label className="text-xs text-[#42484a] flex justify-between mb-1">
                <span>임상 자료 업로드</span>
                <span className="text-[10px] uppercase tracking-wider opacity-60">Optional</span>
              </label>
              <div
                className={`flex items-center gap-3 p-3 border border-dashed rounded-lg cursor-pointer transition-colors ${
                  isDragging
                    ? "border-[#2f628c] bg-[#cee5ff]/30"
                    : "border-[#c1c7c9] bg-[#eff4ff] hover:border-[#2f628c]"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
              >
                <span className="material-symbols-outlined text-[#42484a]" style={{ fontSize: "22px" }}>upload_file</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#101c2a]">파일을 드래그하거나 클릭해서 업로드</p>
                  <p className="text-[10px] text-[#72787a]">PDF, JPG, PNG, WebP · 최대 10MB</p>
                </div>
                <span className="text-[#2f628c] text-xs font-medium hover:underline shrink-0">Browse</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              {uploadedFiles.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {uploadedFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-[#eff4ff] border border-[#c1c7c9] rounded-lg text-xs text-[#101c2a]">
                      <span className="material-symbols-outlined text-[#2f628c]" style={{ fontSize: "14px" }}>
                        {f.type === "application/pdf" ? "picture_as_pdf" : "image"}
                      </span>
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-[#72787a] shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setUploadedFiles((prev) => prev.filter((_, j) => j !== i)); }}
                        className="text-[#72787a] hover:text-red-500 transition-colors"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>close</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              onClick={saveSymptoms}
              disabled={savingSymptoms}
              className="w-full bg-[#2f628c] text-white px-4 py-2.5 rounded-lg text-xs font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 disabled:opacity-50 uppercase tracking-wider"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>save</span>
              {savingSymptoms ? "저장 중..." : "SAVE DATA"}
            </button>
          </div>
        </div>

        {/* Bar Chart: 운동 기록 */}
        <div className="col-span-12 md:col-span-8 bg-white border border-[#c1c7c9] rounded-lg p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-[#101c2a]">운동 기록</h3>
            <div className="flex gap-3">
              <span className="flex items-center gap-1.5 text-xs text-[#2f628c]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2f628c]" />
                자세 점수
              </span>
              <span className="flex items-center gap-1.5 text-xs text-[#42484a]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#c1c7c9]" />
                기준
              </span>
            </div>
          </div>
          <div className="h-[200px] w-full flex items-end gap-2 px-2 pb-2 border-b border-l border-[#c1c7c9]">
            {chartBars.map((score, i) => (
              <div
                key={i}
                className="flex-1 relative group rounded-t-lg transition-all hover:opacity-80"
                style={{ height: "100%", display: "flex", alignItems: "flex-end" }}
              >
                <div
                  className="w-full rounded-t-lg transition-all duration-300"
                  style={{
                    height: `${Math.max(score, 5)}%`,
                    backgroundColor:
                      i === chartBars.length - 1 ? "#2f628c" : "rgba(47,98,140,0.35)",
                  }}
                />
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-[#101c2a] whitespace-nowrap">
                  {score.toFixed(0)}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-[#72787a] px-2">
            {chartLabels.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
        </div>

        {/* Last Score Card */}
        <div className="col-span-12 md:col-span-4 bg-[#263140] rounded-lg p-5 flex flex-col justify-center items-center text-center relative overflow-hidden min-h-[280px]">
          <h3 className="text-xs text-[#9ecefd] tracking-widest uppercase mb-3 relative z-10">
            LAST ANALYSIS
          </h3>
          <div className="relative z-10 mb-2">
            <span className="text-7xl font-bold text-white leading-none">
              {lastSession ? Math.round(lastSession.avg_score) : "--"}
            </span>
            <span className="text-2xl text-[#9ecefd]">/100</span>
          </div>
          <div className="bg-[#9ecefd]/20 px-4 py-1 rounded-full relative z-10 mb-3">
            <span className="text-xs text-[#9ecefd] uppercase tracking-wider">
              {lastSession ? getScoreLabel(lastSession.avg_score) : "데이터 없음"}
            </span>
          </div>
          {lastSession && (
            <p className="text-[#cee5ff] text-sm max-w-[180px] relative z-10">
              {exEmoji(lastSession.exercise_type)} {exName(lastSession.exercise_type)}
              {" · "}
              {format(new Date(lastSession.created_at), "M월 d일", { locale: ko })}
            </p>
          )}
          <p className="text-[#9ecefd]/50 text-xs mt-2 relative z-10">총 {history.length}회 운동 완료</p>
        </div>

        {/* Schedule Card */}
        <div className="col-span-12 md:col-span-5 bg-white border border-[#c1c7c9] rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#2f628c]" style={{ fontSize: "20px" }}>event</span>
              <h3 className="text-lg font-semibold text-[#101c2a]">예정된 운동</h3>
            </div>
            <Link href="/calendar" className="text-[#2f628c] text-xs hover:underline">
              일정 관리
            </Link>
          </div>
          {upcoming.length > 0 ? (
            <div className="space-y-2">
              {upcoming.slice(0, 3).map((w) => {
                const dt = new Date(w.scheduled_time);
                return (
                  <div key={w.id} className="flex gap-3 p-2.5 rounded-lg bg-[#eff4ff] border border-[#c1c7c9]">
                    <div className="text-center min-w-[44px]">
                      <p className="text-[10px] text-[#42484a] uppercase">{format(dt, "MMM", { locale: ko })}</p>
                      <p className="text-lg font-bold text-[#101c2a]">{format(dt, "d")}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-[#101c2a]">
                        {exEmoji(w.exercise_type)} {exName(w.exercise_type)}
                      </p>
                      <p className="text-xs text-[#42484a]">
                        {format(dt, "HH:mm")} · 홈 운동
                      </p>
                    </div>
                    <div className="flex items-center">
                      <span className="w-2 h-2 rounded-full bg-[#2f628c]" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-[#42484a] text-sm">
              <span className="material-symbols-outlined block mb-2 text-[#c1c7c9]" style={{ fontSize: "36px" }}>
                event_busy
              </span>
              예정된 운동이 없습니다
              <br />
              <Link href="/calendar" className="text-[#2f628c] text-xs hover:underline mt-1 inline-block">
                일정 추가하기
              </Link>
            </div>
          )}
        </div>

        {/* Recent Activity / Alerts */}
        <div className="col-span-12 md:col-span-7 bg-white border border-[#c1c7c9] rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#2f628c]" style={{ fontSize: "20px" }}>notifications_active</span>
              <h3 className="text-lg font-semibold text-[#101c2a]">최근 운동 기록</h3>
            </div>
            {history.length > 0 && (
              <span className="bg-[#ffdad6] text-[#93000a] px-2 py-1 rounded-lg text-xs">
                {history.length}회 완료
              </span>
            )}
          </div>
          {history.length > 0 ? (
            <div className="space-y-0.5">
              {history.slice(0, 4).map((s) => (
                <div
                  key={s.id}
                  className="flex items-start gap-3 p-2.5 border-b border-[#c1c7c9]/40 hover:bg-[#f8f9ff] transition-colors rounded-lg"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#2f628c]/10 flex items-center justify-center shrink-0 text-xl">
                    {exEmoji(s.exercise_type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h4 className="text-xs font-bold text-[#101c2a]">{exName(s.exercise_type)} 완료</h4>
                      <span className="text-xs text-[#42484a]">
                        {format(new Date(s.created_at), "M.d HH:mm")}
                      </span>
                    </div>
                    <p className="text-xs text-[#42484a] mt-0.5">
                      자세 점수{" "}
                      <span className="font-semibold" style={{ color: getScoreColor(s.avg_score) }}>
                        {s.avg_score.toFixed(0)}점
                      </span>{" "}
                      · {getScoreLabel(s.avg_score)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-[#42484a] text-sm">
              <span className="material-symbols-outlined block mb-2 text-[#c1c7c9]" style={{ fontSize: "36px" }}>
                fitness_center
              </span>
              아직 운동 기록이 없습니다
              <br />
              <Link href="/exercise" className="text-[#2f628c] text-xs hover:underline mt-1 inline-block">
                첫 운동 시작하기
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-50">
        <Link
          href="/scanpose"
          className="flex items-center gap-2 bg-[#2f628c] text-white px-6 py-3.5 rounded-full shadow-lg hover:scale-105 transition-transform"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>add_a_photo</span>
          <span className="text-xs font-bold">Start Scan</span>
        </Link>
      </div>
    </div>
  );
}
