"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { api, ProcessDocumentResult, NFAVideo } from "@/lib/api";
import { USER_ID } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  inbody: "인바디 결과지",
  other:  "기타 문서",
};

type AnalysisMode = "full" | "doc_only" | "pose_only" | "general";

const MODE_LABEL: Record<AnalysisMode, { text: string; color: string }> = {
  full:      { text: "📊 종합 분석 기반 추천",   color: "bg-[#c3c0ff]/20 text-[#c3c0ff]" },
  doc_only:  { text: "📄 건강 문서 기반 추천",   color: "bg-blue-500/20 text-blue-300" },
  pose_only: { text: "🧍 자세 분석 기반 추천",   color: "bg-green-500/20 text-green-300" },
  general:   { text: "💡 일반 추천",             color: "bg-white/10 text-[#c7c4da]" },
};

const RISK_TAG_LABELS: Record<string, string> = {
  avoid_high_intensity:      "고강도 운동 금지",
  avoid_jump:                "점프 동작 금지",
  avoid_spinal_flexion_load: "허리 굴곡 부하 금지",
  avoid_impact:              "충격 운동 금지",
  avoid_overhead:            "오버헤드 동작 금지",
  monitor_blood_sugar:       "혈당 모니터링 필요",
  monitor_breathing:         "호흡 모니터링 필요",
};

type PostureIssue = { severity: string; message: string };
type CaptureResult = { score: number; issues: PostureIssue[] };
type PostureAnalysis = { date: string; front: CaptureResult | null; side: CaptureResult | null };

type Analysis = {
  state_summary: string;
  main_concerns: string[];
  risk_areas: string[];
  recommendation_note: string;
  exercise_reasons: Record<string, string>;
};

function ExercisePageInner() {
  const [posture, setPosture] = useState<PostureAnalysis | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [storedDocResults, setStoredDocResults] = useState<ProcessDocumentResult[]>([]);
  const [docResults, setDocResults] = useState<ProcessDocumentResult[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode | null>(null);
  const [nfaVideos, setNfaVideos] = useState<NFAVideo[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("fitai_posture_analysis");
      if (raw) setPosture(JSON.parse(raw));
    } catch {}
    const saved = localStorage.getItem("fitai_symptoms");
    if (saved) setSymptoms(saved);
    try {
      const docsRaw = localStorage.getItem("fitai_health_documents");
      if (docsRaw) {
        const docs = JSON.parse(docsRaw) as ProcessDocumentResult[];
        if (docs.length > 0) setStoredDocResults(docs);
      }
    } catch {}
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const allowed = Array.from(files).filter((f) =>
      ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(f.type)
    );
    setUploadedFiles((prev) => [...prev, ...allowed]);
  };

  const allIssues = [
    ...(posture?.front?.issues ?? []),
    ...(posture?.side?.issues ?? []),
  ]
    .filter((i) => i.severity !== "good")
    .map((i) => i.message);

  const handleAnalyze = async () => {
    setLoading(true);
    setAnalysis(null);
    setAnalysisMode(null);
    setNfaVideos([]);
    setDocResults([]);

    let docText = "";
    let mergedHealthInfo: ProcessDocumentResult["health_info"] = {};
    let allRiskTags: string[] = [];

    for (const r of storedDocResults) {
      if (r.parsed_text) docText += r.parsed_text + "\n";
      allRiskTags = [...new Set([...allRiskTags, ...r.risk_tags])];
      mergedHealthInfo = { ...mergedHealthInfo, ...r.health_info };
    }

    if (uploadedFiles.length > 0) {
      setLoadingStep("문서 분류 및 정보 추출 중...");
      const results = await Promise.all(
        uploadedFiles.map((f) => api.processDocument(f, { user_id: USER_ID, symptoms }).catch(() => null))
      );
      const valid = results.filter(Boolean) as ProcessDocumentResult[];
      setDocResults(valid);
      for (const r of valid) {
        if (r.parsed_text) docText += r.parsed_text + "\n";
        allRiskTags = [...new Set([...allRiskTags, ...r.risk_tags])];
        mergedHealthInfo = { ...mergedHealthInfo, ...r.health_info };
      }
    }

    setLoadingStep("AI 분석 및 운동 영상 불러오는 중...");

    const painArea: string[] = [];
    for (const issue of allIssues) {
      if (issue.includes("거북목") || issue.includes("머리") || issue.includes("목")) painArea.push("neck");
      if (issue.includes("어깨")) painArea.push("shoulder");
      if (issue.includes("골반") || issue.includes("허리") || issue.includes("과신전") || issue.includes("척추")) painArea.push("back");
      if (issue.includes("무릎")) painArea.push("knee");
    }
    if (symptoms.includes("목")) painArea.push("neck");
    if (symptoms.includes("어깨")) painArea.push("shoulder");
    if (symptoms.includes("허리")) painArea.push("back");
    if (symptoms.includes("무릎")) painArea.push("knee");
    const uniquePainArea = [...new Set(painArea)];

    const scores = [posture?.front?.score, posture?.side?.score].filter((s): s is number => s !== undefined);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const level = avgScore >= 75 ? "intermediate" : "beginner";
    const age = mergedHealthInfo.user_profile?.age ?? 30;

    setLoadingStep("AI 상태 분석 중...");
    let result: { analysis: Analysis; analysis_mode: AnalysisMode; exercises: unknown[] };
    try {
      result = await api.recommendExercises({
        user_id: USER_ID,
        posture_issues: allIssues,
        front_score: posture?.front?.score ?? 0,
        side_score: posture?.side?.score ?? 0,
        symptoms,
        doc_text: docText,
        health_info: mergedHealthInfo,
        risk_tags: allRiskTags,
      }) as { analysis: Analysis; analysis_mode: AnalysisMode; exercises: unknown[] };
    } catch (e) {
      console.error("[exercise] analyze error:", e);
      setLoadingStep("분석 중 오류가 발생했습니다.");
      setLoading(false);
      return;
    }
    setAnalysis(result.analysis);
    setAnalysisMode(result.analysis_mode ?? null);

    setLoadingStep("분석 결과 기반 운동 영상 불러오는 중...");
    const analysisGoal = [
      ...(result.analysis.main_concerns ?? []),
      ...(result.analysis.risk_areas ?? []),
    ].join(", ") || symptoms || allIssues[0] || "체력증진";

    const { videos: nfaResult } = await api.getNFAVideos({
      age,
      goal: analysisGoal,
      pain_area: uniquePainArea,
      place: "home",
      level,
      available_time_min: 15,
      health_info: mergedHealthInfo,
      risk_tags: allRiskTags,
      max_results: 8,
    }).catch(() => ({ videos: [] as NFAVideo[], count: 0 }));

    setNfaVideos(nfaResult);
    setLoadingStep("");
    setLoading(false);
  };

  const hasPosture = !!posture?.front || !!posture?.side;
  const hasDoc = storedDocResults.length > 0 || uploadedFiles.length > 0;
  const canAnalyze = hasPosture || hasDoc;

  return (
    <div className="min-h-screen bg-[#050505] px-5 pb-16">
      {/* Header */}
      <div className="py-6">
        <h1 className="font-oswald text-3xl font-bold text-[#e5e2e1] uppercase tracking-tight">
          운동 시작
        </h1>
        <p className="text-sm text-[#c7c4da]/50 mt-1">
          AI가 내 자세·증상·임상 자료를 분석해 맞춤 운동을 추천합니다.
        </p>
      </div>

      <div className="flex flex-col gap-5 max-w-3xl mx-auto w-full">
        {/* Input summary */}
        <div className="glass-card p-5 flex flex-col gap-5">
          <h2 className="text-sm font-semibold text-[#e5e2e1] flex items-center gap-2">
            <span
              className="material-symbols-outlined text-[#c3c0ff]"
              style={{ fontSize: "18px", fontVariationSettings: "'FILL' 1" }}
            >
              analytics
            </span>
            분석에 사용할 데이터
          </h2>

          {/* Posture */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-[#c3c0ff]/60 uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>accessibility_new</span>
              자세 분석 결과
            </p>
            {hasPosture ? (
              <div className="flex flex-wrap gap-2">
                {posture!.front && (
                  <span className="px-2.5 py-1 bg-[#4a3aff]/20 border border-[#c3c0ff]/30 rounded-full text-xs text-[#c3c0ff]">
                    정면 {posture!.front.score.toFixed(0)}점
                  </span>
                )}
                {posture!.side && (
                  <span className="px-2.5 py-1 bg-[#4a3aff]/20 border border-[#c3c0ff]/30 rounded-full text-xs text-[#c3c0ff]">
                    측면 {posture!.side.score.toFixed(0)}점
                  </span>
                )}
                {allIssues.map((msg, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-[#ffb4ab]/15 border border-[#ffb4ab]/40 rounded-full text-xs text-[#ffb4ab]"
                  >
                    {msg.length > 20 ? msg.slice(0, 20) + "…" : msg}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#c7c4da]/35 italic">
                자세 분석 결과 없음 —{" "}
                <a href="/scanpose/scan" className="text-[#c3c0ff]/60 hover:text-[#c3c0ff] transition-colors">
                  자세 분석
                </a>
                을 먼저 진행해주세요.
              </p>
            )}
          </div>

          {/* Symptoms */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-[#c3c0ff]/60 uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>clinical_notes</span>
              증상/불편사항
            </p>
            {symptoms ? (
              <div className="flex flex-wrap gap-1.5">
                {symptoms
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((s) => (
                    <span
                      key={s}
                      className="px-2.5 py-1 bg-[#4a3aff]/20 border border-[#c3c0ff]/30 text-[#c3c0ff] rounded-full text-xs"
                    >
                      {s}
                    </span>
                  ))}
              </div>
            ) : (
              <p className="text-xs text-[#c7c4da]/35 italic">
                증상 없음 — Dashboard에서 입력할 수 있습니다.
              </p>
            )}
          </div>

          {/* File upload */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-[#c3c0ff]/60 uppercase tracking-widest flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>upload_file</span>
              임상 자료 (선택)
            </p>

            {/* Dashboard에서 불러온 문서 */}
            {storedDocResults.length > 0 && (
              <div className="flex flex-col gap-2 p-3 bg-[#00e293]/10 border border-[#00e293]/30 rounded-xl">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-[#00e293] font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>
                      check_circle
                    </span>
                    Dashboard에서 불러온 문서
                  </p>
                  <button
                    onClick={() => {
                      localStorage.removeItem("fitai_health_documents");
                      setStoredDocResults([]);
                    }}
                    className="text-[10px] text-[#c7c4da]/40 hover:text-[#ffb4ab] transition-colors"
                  >
                    초기화
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {storedDocResults.map((r, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-[#00e293]/10 border border-[#00e293]/30 rounded-full text-[10px] text-[#00e293]"
                    >
                      {CATEGORY_LABELS[r.document_category] ?? r.document_category}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div
              className={`flex items-center gap-3 p-3.5 border border-dashed rounded-xl cursor-pointer transition-all ${
                isDragging
                  ? "border-[#4a3aff] bg-[#4a3aff]/10"
                  : "border-[#c3c0ff]/20 bg-white/[0.02] hover:border-[#c3c0ff]/40 hover:bg-white/[0.04]"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFiles(e.dataTransfer.files);
              }}
            >
              <span
                className="material-symbols-outlined text-[#c3c0ff]/50"
                style={{ fontSize: "20px" }}
              >
                upload_file
              </span>
              <p className="text-xs text-[#c7c4da]/40">
                PDF, JPG, PNG, WebP — 드래그하거나 클릭해서 업로드
              </p>
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
              <ul className="flex flex-col gap-1 mt-1">
                {uploadedFiles.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-xs text-[#c7c4da]"
                  >
                    <span
                      className="material-symbols-outlined text-[#c3c0ff]/60"
                      style={{ fontSize: "14px" }}
                    >
                      {f.type === "application/pdf" ? "picture_as_pdf" : "image"}
                    </span>
                    <span className="flex-1 truncate">{f.name}</span>
                    <button
                      onClick={() => setUploadedFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-[#c7c4da]/30 hover:text-[#ffb4ab] transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>close</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* 문서 처리 결과 카드 */}
            {docResults.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                {docResults.map((r, i) => {
                  const body = r.health_info.body_composition;
                  const fitness = r.health_info.fitness_assessment;
                  const medical = r.health_info.medical_assessment;
                  const profile = r.health_info.user_profile;
                  return (
                    <div
                      key={i}
                      className="bg-[#4a3aff]/10 border border-[#c3c0ff]/20 rounded-xl p-3 flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="material-symbols-outlined text-[#c3c0ff]"
                          style={{ fontSize: "16px" }}
                        >
                          description
                        </span>
                        <span className="text-xs font-bold text-[#c3c0ff]">
                          {uploadedFiles[i]?.name ?? `문서 ${i + 1}`}
                        </span>
                        <span className="ml-auto px-2 py-0.5 bg-[#4a3aff] text-white text-[10px] rounded-full">
                          {CATEGORY_LABELS[r.document_category] ?? r.document_category}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {profile?.age && (
                          <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-[#c7c4da]/70">
                            {profile.age}세{" "}
                            {profile.gender === "male" ? "남" : profile.gender === "female" ? "여" : ""}
                          </span>
                        )}
                        {body?.body_fat_percentage != null && (
                          <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-[#c7c4da]/70">
                            체지방 {body.body_fat_percentage}%
                          </span>
                        )}
                        {body?.skeletal_muscle_mass_kg != null && (
                          <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-[#c7c4da]/70">
                            골격근 {body.skeletal_muscle_mass_kg}kg
                          </span>
                        )}
                        {body?.inbody_score != null && (
                          <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-[#c7c4da]/70">
                            인바디 {body.inbody_score}점
                          </span>
                        )}
                        {fitness?.overall_fitness_level && (
                          <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-[#c7c4da]/70">
                            종합체력 {fitness.overall_fitness_level}
                          </span>
                        )}
                        {medical?.diagnosis && medical.diagnosis.length > 0 && (
                          <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-[#c7c4da]/70">
                            진단: {medical.diagnosis.slice(0, 2).join(", ")}
                          </span>
                        )}
                        {medical?.rehabilitation_stage && (
                          <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-[#c7c4da]/70">
                            재활 {medical.rehabilitation_stage}
                          </span>
                        )}
                      </div>

                      {r.risk_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {r.risk_tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-[#ffb4ab]/15 border border-[#ffb4ab]/40 rounded text-[10px] text-[#ffb4ab] flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: "10px" }}>
                                warning
                              </span>
                              {RISK_TAG_LABELS[tag] ?? tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 최소 입력 없을 때 안내 */}
        {!canAnalyze && (
          <p className="text-xs text-[#c7c4da]/40 text-center -mt-1">
            자세 분석 결과 또는 인바디 문서 중 최소 하나를 입력해야 분석할 수 있습니다.
          </p>
        )}

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={loading || !canAnalyze}
          className="w-full py-4 rounded-xl text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #1d00a5, #4a3aff 60%, #552ba0)" }}
        >
          {loading ? (
            <>
              <span
                className="animate-spin material-symbols-outlined"
                style={{ fontSize: "18px" }}
              >
                progress_activity
              </span>
              {loadingStep || "분석 중..."}
            </>
          ) : (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>smart_toy</span>
              AI 분석 시작
            </>
          )}
        </button>

        {/* Analysis result */}
        {analysis && (
          <div className="glass-card p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="material-symbols-outlined text-[#c3c0ff]"
                style={{ fontSize: "20px", fontVariationSettings: "'FILL' 1" }}
              >
                psychology
              </span>
              <h2 className="text-sm font-bold text-[#c3c0ff] uppercase tracking-wider">
                AI 현재 상태 분석
              </h2>
              {analysisMode && (
                <span className={`ml-auto px-2.5 py-1 rounded-lg text-xs font-medium ${MODE_LABEL[analysisMode].color}`}>
                  {MODE_LABEL[analysisMode].text}
                </span>
              )}
            </div>
            <p className="text-sm text-[#e5e2e1] leading-relaxed">{analysis.state_summary}</p>

            {analysis.main_concerns.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {analysis.main_concerns.map((c, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-[#ffb4ab]/15 border border-[#ffb4ab]/40 rounded-full text-xs text-[#ffb4ab]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {analysis.risk_areas.length > 0 && (
              <p className="text-xs text-amber-300 flex items-start gap-1.5 mt-1">
                <span className="material-symbols-outlined shrink-0" style={{ fontSize: "14px" }}>
                  warning
                </span>
                주의 부위: {analysis.risk_areas.join(", ")}
              </p>
            )}

            {(analysis.recommendation_note ||
              Object.keys(analysis.exercise_reasons ?? {}).length > 0) && (
              <div className="mt-1 border-t border-white/5 pt-3 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="material-symbols-outlined text-[#00e293]"
                    style={{ fontSize: "16px", fontVariationSettings: "'FILL' 1" }}
                  >
                    lightbulb
                  </span>
                  <h3 className="text-xs font-bold text-[#00e293] uppercase tracking-wider">
                    운동 추천 이유
                  </h3>
                </div>

                {analysis.recommendation_note && (
                  <p className="text-xs text-[#c7c4da] leading-relaxed">
                    {analysis.recommendation_note}
                  </p>
                )}

                {Object.keys(analysis.exercise_reasons ?? {}).length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {Object.entries(analysis.exercise_reasons).map(([name, reason]) => (
                      <li key={name} className="flex gap-2 text-xs">
                        <span
                          className="material-symbols-outlined text-[#c3c0ff] shrink-0"
                          style={{ fontSize: "14px" }}
                        >
                          check_circle
                        </span>
                        <span className="text-[#c7c4da] leading-relaxed">
                          <span className="text-[#e5e2e1] font-semibold">{name}</span> — {reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* 국민체력100 추천 운동 영상 */}
        {nfaVideos.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <h2 className="font-oswald text-xl font-bold text-[#e5e2e1] uppercase">
                추천 운동 영상
              </h2>
              <span className="px-2 py-0.5 bg-[#4a3aff]/30 text-[#c3c0ff] text-[10px] rounded-full border border-[#c3c0ff]/30">
                국민체력100
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {nfaVideos.map((v, i) => (
                <a
                  key={i}
                  href={v.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-card overflow-hidden flex flex-col group hover:border-[#4a3aff]/60 transition-colors"
                >
                  {/* 썸네일 */}
                  <div className="relative aspect-video bg-[#0d0d0d] overflow-hidden">
                    {v.thumbnail_url ? (
                      <img
                        src={v.thumbnail_url}
                        alt={v.title}
                        className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span
                          className="material-symbols-outlined text-[#c3c0ff]/20"
                          style={{ fontSize: "40px" }}
                        >
                          play_circle
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span
                        className="material-symbols-outlined text-white bg-[#050505]/70 rounded-full p-1"
                        style={{ fontSize: "32px" }}
                      >
                        play_circle
                      </span>
                    </div>
                  </div>

                  {/* 영상 정보 */}
                  <div className="p-3 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-[#e5e2e1] line-clamp-2 leading-snug">
                      {v.title}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {v.target_body_part.slice(0, 3).map((part) => (
                        <span
                          key={part}
                          className="px-1.5 py-0.5 bg-[#4a3aff]/20 border border-[#c3c0ff]/20 text-[#c3c0ff] text-[10px] rounded-full"
                        >
                          {part}
                        </span>
                      ))}
                      <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 text-[#c7c4da]/60 text-[10px] rounded-full">
                        {v.level === "beginner" ? "초급" : v.level === "intermediate" ? "중급" : "고급"}
                      </span>
                      {v.duration_min > 0 && (
                        <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 text-[#c7c4da]/60 text-[10px] rounded-full">
                          {v.duration_min}분
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExercisePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-[#c7c4da]/40">로딩 중...</div>
      }
    >
      <ExercisePageInner />
    </Suspense>
  );
}
