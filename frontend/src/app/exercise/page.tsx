"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { api, ProcessDocumentResult, NFAVideo } from "@/lib/api";
import { USER_ID } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  inbody:              "인바디 결과지",
  national_fitness_100:"국민체력100 결과지",
  rehabilitation_guide:"재활 안내문",
  health_checkup:      "건강검진표",
  other:               "기타 문서",
};

const RISK_TAG_LABELS: Record<string, string> = {
  avoid_high_intensity:       "고강도 운동 금지",
  avoid_jump:                 "점프 동작 금지",
  avoid_spinal_flexion_load:  "허리 굴곡 부하 금지",
  avoid_impact:               "충격 운동 금지",
  avoid_overhead:             "오버헤드 동작 금지",
  monitor_blood_sugar:        "혈당 모니터링 필요",
  monitor_breathing:          "호흡 모니터링 필요",
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
    setNfaVideos([]);
    setDocResults([]);

    // Step 1: 문서 분류 + 정보 추출
    let docText = "";
    let mergedHealthInfo: ProcessDocumentResult["health_info"] = {};
    let allRiskTags: string[] = [];

    // Dashboard에서 저장된 문서 먼저 적용
    for (const r of storedDocResults) {
      if (r.parsed_text) docText += r.parsed_text + "\n";
      allRiskTags = [...new Set([...allRiskTags, ...r.risk_tags])];
      mergedHealthInfo = { ...mergedHealthInfo, ...r.health_info };
    }

    if (uploadedFiles.length > 0) {
      setLoadingStep("문서 분류 및 정보 추출 중...");
      const results = await Promise.all(
        uploadedFiles.map((f) => api.processDocument(f).catch(() => null))
      );
      const valid = results.filter(Boolean) as ProcessDocumentResult[];
      setDocResults(valid);
      for (const r of valid) {
        if (r.parsed_text) docText += r.parsed_text + "\n";
        allRiskTags = [...new Set([...allRiskTags, ...r.risk_tags])];
        mergedHealthInfo = { ...mergedHealthInfo, ...r.health_info };
      }
    }

    // Step 2: AI 분석 + NFA 영상 병렬 호출
    setLoadingStep("AI 분석 및 운동 영상 불러오는 중...");

    // 자세 이슈에서 통증 부위 추출
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

    // Step 2-A: AI 분석 먼저
    setLoadingStep("AI 상태 분석 중...");
    let result: { analysis: Analysis; exercises: unknown[] };
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
      }) as { analysis: Analysis; exercises: unknown[] };
    } catch (e) {
      console.error("[exercise] analyze error:", e);
      setLoadingStep("분석 중 오류가 발생했습니다.");
      setLoading(false);
      return;
    }
    setAnalysis(result.analysis);

    // Step 2-B: 분석 결과를 goal로 넘겨 NFA 영상 검색
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

  return (
    <div className="min-h-screen bg-[#f8f9ff] px-6 pb-16">
      {/* Header */}
      <div className="py-6">
        <h1 className="text-[32px] font-bold text-[#101c2a] leading-10">운동 시작</h1>
        <p className="text-sm text-[#42484a] mt-1">AI가 내 자세·증상·임상 자료를 분석해 맞춤 운동을 추천합니다.</p>
      </div>

      <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
        {/* Input summary */}
        <div className="bg-white border border-[#c1c7c9] rounded-lg p-5 flex flex-col gap-4">
          <h2 className="text-base font-semibold text-[#101c2a]">분석에 사용할 데이터</h2>

          {/* Posture */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-[#42484a] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[#2f628c]" style={{ fontSize: "16px" }}>accessibility_new</span>
              자세 분석 결과
            </p>
            {hasPosture ? (
              <div className="flex flex-wrap gap-2">
                {posture!.front && (
                  <span className="px-2.5 py-1 bg-[#eff4ff] border border-[#c1c7c9] rounded-full text-xs text-[#235881]">
                    정면 {posture!.front.score.toFixed(0)}점
                  </span>
                )}
                {posture!.side && (
                  <span className="px-2.5 py-1 bg-[#eff4ff] border border-[#c1c7c9] rounded-full text-xs text-[#235881]">
                    측면 {posture!.side.score.toFixed(0)}점
                  </span>
                )}
                {allIssues.length > 0 && allIssues.map((msg, i) => (
                  <span key={i} className="px-2.5 py-1 bg-[#ffdad6] border border-[#ffb4ab] rounded-full text-xs text-[#93000a]">
                    {msg.length > 20 ? msg.slice(0, 20) + "…" : msg}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#72787a] italic">
                자세 분석 결과 없음 — 먼저{" "}
                <a href="/scanpose/scan" className="text-[#2f628c] hover:underline">자세 분석</a>을 진행해주세요.
              </p>
            )}
          </div>

          {/* Symptoms */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-[#42484a] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[#2f628c]" style={{ fontSize: "16px" }}>clinical_notes</span>
              증상/불편사항
            </p>
            {symptoms ? (
              <div className="flex flex-wrap gap-1.5">
                {symptoms.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                  <span key={s} className="px-2.5 py-1 bg-[#cee5ff] text-[#235881] rounded-full text-xs">{s}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#72787a] italic">증상 없음 — Dashboard에서 입력할 수 있습니다.</p>
            )}
          </div>

          {/* File upload */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-[#42484a] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[#2f628c]" style={{ fontSize: "16px" }}>upload_file</span>
              임상 자료 (선택)
            </p>

            {/* Dashboard에서 불러온 문서 */}
            {storedDocResults.length > 0 && (
              <div className="flex flex-col gap-1.5 p-2.5 bg-[#e8f5e9] border border-[#a5d6a7] rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-[#2e7d32] font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>check_circle</span>
                    Dashboard에서 불러온 문서
                  </p>
                  <button
                    onClick={() => {
                      localStorage.removeItem("fitai_health_documents");
                      setStoredDocResults([]);
                    }}
                    className="text-[10px] text-[#72787a] hover:text-red-500 transition-colors"
                  >
                    초기화
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {storedDocResults.map((r, i) => (
                    <span key={i} className="px-2 py-0.5 bg-white border border-[#a5d6a7] rounded-full text-[10px] text-[#1b5e20]">
                      {CATEGORY_LABELS[r.document_category] ?? r.document_category}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div
              className={`flex items-center gap-3 p-3 border border-dashed rounded-lg cursor-pointer transition-colors ${
                isDragging ? "border-[#2f628c] bg-[#cee5ff]/30" : "border-[#c1c7c9] bg-[#f8f9ff] hover:border-[#2f628c]"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
            >
              <span className="material-symbols-outlined text-[#42484a]" style={{ fontSize: "20px" }}>upload_file</span>
              <p className="text-xs text-[#42484a]">PDF, JPG, PNG, WebP — 드래그하거나 클릭해서 업로드</p>
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
                  <li key={i} className="flex items-center gap-2 px-3 py-1.5 bg-[#eff4ff] border border-[#c1c7c9] rounded-lg text-xs text-[#101c2a]">
                    <span className="material-symbols-outlined text-[#2f628c]" style={{ fontSize: "14px" }}>
                      {f.type === "application/pdf" ? "picture_as_pdf" : "image"}
                    </span>
                    <span className="flex-1 truncate">{f.name}</span>
                    <button
                      onClick={() => setUploadedFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-[#72787a] hover:text-red-500 transition-colors"
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
                    <div key={i} className="bg-[#f0f7ff] border border-[#9ecefd] rounded-lg p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#2f628c]" style={{ fontSize: "16px" }}>description</span>
                        <span className="text-xs font-bold text-[#235881]">
                          {uploadedFiles[i]?.name ?? `문서 ${i + 1}`}
                        </span>
                        <span className="ml-auto px-2 py-0.5 bg-[#2f628c] text-white text-[10px] rounded-full">
                          {CATEGORY_LABELS[r.document_category] ?? r.document_category}
                        </span>
                      </div>

                      {/* 추출 지표 */}
                      <div className="flex flex-wrap gap-1.5">
                        {profile?.age && (
                          <span className="px-2 py-0.5 bg-white border border-[#c1c7c9] rounded text-[10px] text-[#42484a]">
                            {profile.age}세 {profile.gender === "male" ? "남" : profile.gender === "female" ? "여" : ""}
                          </span>
                        )}
                        {body?.body_fat_percentage != null && (
                          <span className="px-2 py-0.5 bg-white border border-[#c1c7c9] rounded text-[10px] text-[#42484a]">
                            체지방 {body.body_fat_percentage}%
                          </span>
                        )}
                        {body?.skeletal_muscle_mass_kg != null && (
                          <span className="px-2 py-0.5 bg-white border border-[#c1c7c9] rounded text-[10px] text-[#42484a]">
                            골격근 {body.skeletal_muscle_mass_kg}kg
                          </span>
                        )}
                        {body?.inbody_score != null && (
                          <span className="px-2 py-0.5 bg-white border border-[#c1c7c9] rounded text-[10px] text-[#42484a]">
                            인바디 {body.inbody_score}점
                          </span>
                        )}
                        {fitness?.overall_fitness_level && (
                          <span className="px-2 py-0.5 bg-white border border-[#c1c7c9] rounded text-[10px] text-[#42484a]">
                            종합체력 {fitness.overall_fitness_level}
                          </span>
                        )}
                        {medical?.diagnosis && medical.diagnosis.length > 0 && (
                          <span className="px-2 py-0.5 bg-white border border-[#c1c7c9] rounded text-[10px] text-[#42484a]">
                            진단: {medical.diagnosis.slice(0, 2).join(", ")}
                          </span>
                        )}
                        {medical?.rehabilitation_stage && (
                          <span className="px-2 py-0.5 bg-white border border-[#c1c7c9] rounded text-[10px] text-[#42484a]">
                            재활 {medical.rehabilitation_stage}
                          </span>
                        )}
                      </div>

                      {/* 위험 태그 */}
                      {r.risk_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {r.risk_tags.map((tag) => (
                            <span key={tag} className="px-2 py-0.5 bg-[#ffdad6] border border-[#ffb4ab] rounded text-[10px] text-[#93000a] flex items-center gap-1">
                              <span className="material-symbols-outlined" style={{ fontSize: "10px" }}>warning</span>
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

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full bg-[#2f628c] text-white py-3.5 rounded-lg text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="animate-spin material-symbols-outlined" style={{ fontSize: "18px" }}>progress_activity</span>
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
          <div className="bg-[#101c2a] rounded-lg p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[#9ecefd]" style={{ fontSize: "20px" }}>psychology</span>
              <h2 className="text-sm font-bold text-[#9ecefd] uppercase tracking-wider">AI 현재 상태 분석</h2>
            </div>
            <p className="text-sm text-white leading-relaxed">{analysis.state_summary}</p>

            {analysis.main_concerns.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {analysis.main_concerns.map((c, i) => (
                  <span key={i} className="px-2.5 py-1 bg-red-500/20 border border-red-500/40 rounded-full text-xs text-red-300">
                    {c}
                  </span>
                ))}
              </div>
            )}

            {analysis.risk_areas.length > 0 && (
              <p className="text-xs text-amber-300 flex items-start gap-1.5 mt-1">
                <span className="material-symbols-outlined shrink-0" style={{ fontSize: "14px" }}>warning</span>
                주의 부위: {analysis.risk_areas.join(", ")}
              </p>
            )}

            <p className="text-xs text-[#9ecefd]/70 mt-1 border-t border-white/10 pt-3">{analysis.recommendation_note}</p>
          </div>
        )}

        {/* 국민체력100 추천 운동 영상 */}
        {nfaVideos.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-[#101c2a]">추천 운동 영상</h2>
              <span className="px-2 py-0.5 bg-[#eff4ff] text-[#235881] text-[10px] rounded-full">국민체력100</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {nfaVideos.map((v, i) => (
                <a
                  key={i}
                  href={v.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white border border-[#c1c7c9] rounded-lg overflow-hidden flex flex-col group hover:border-[#2f628c] transition-colors"
                >
                  {/* 썸네일 */}
                  <div className="relative aspect-video bg-[#f8f9ff] overflow-hidden">
                    {v.thumbnail_url ? (
                      <img
                        src={v.thumbnail_url}
                        alt={v.title}
                        className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#c1c7c9]" style={{ fontSize: "40px" }}>play_circle</span>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="material-symbols-outlined text-white bg-black/60 rounded-full p-1" style={{ fontSize: "32px" }}>
                        play_circle
                      </span>
                    </div>
                  </div>

                  {/* 영상 정보 */}
                  <div className="p-3 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-[#101c2a] line-clamp-2 leading-snug">{v.title}</p>
                    <div className="flex flex-wrap gap-1">
                      {v.target_body_part.slice(0, 3).map((part) => (
                        <span key={part} className="px-1.5 py-0.5 bg-[#cee5ff] text-[#235881] text-[10px] rounded-full">
                          {part}
                        </span>
                      ))}
                      <span className="px-1.5 py-0.5 bg-[#eff4ff] text-[#235881] text-[10px] rounded-full">
                        {v.level === "beginner" ? "초급" : v.level === "intermediate" ? "중급" : "고급"}
                      </span>
                      {v.duration_min > 0 && (
                        <span className="px-1.5 py-0.5 bg-[#f8f9ff] border border-[#c1c7c9] text-[#42484a] text-[10px] rounded-full">
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
    <Suspense fallback={<div className="p-8 text-center text-[#42484a]">로딩 중...</div>}>
      <ExercisePageInner />
    </Suspense>
  );
}
