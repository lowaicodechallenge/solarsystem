"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { api } from "@/lib/api";
import { USER_ID } from "@/lib/utils";

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

type Exercise = {
  id: string;
  name: string;
  description: string;
  youtube_query: string;
  difficulty: number;
  duration_minutes: number;
  reason: string;
};

type VideoResult = {
  video_id: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
};

function ExercisePageInner() {
  const [posture, setPosture] = useState<PostureAnalysis | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [videoMap, setVideoMap] = useState<Record<string, VideoResult[]>>({});
  const [searchUrlMap, setSearchUrlMap] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("fitai_posture_analysis");
      if (raw) setPosture(JSON.parse(raw));
    } catch {}
    const saved = localStorage.getItem("fitai_symptoms");
    if (saved) setSymptoms(saved);
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
    setExercises([]);
    setVideoMap({});

    // OCR uploaded files
    let docText = "";
    if (uploadedFiles.length > 0) {
      setLoadingStep("임상 자료 분석 중...");
      for (const file of uploadedFiles) {
        try {
          const { text } = await api.ocrDocument(file);
          if (text) docText += text + "\n";
        } catch {}
      }
    }

    // LLM analysis
    setLoadingStep("AI가 현재 상태를 분석 중...");
    let result: { analysis: Analysis; exercises: Exercise[] } | null = null;
    try {
      result = await api.recommendExercises({
        user_id: USER_ID,
        posture_issues: allIssues,
        front_score: posture?.front?.score ?? 0,
        side_score: posture?.side?.score ?? 0,
        symptoms,
        doc_text: docText,
      }) as { analysis: Analysis; exercises: Exercise[] };
    } catch {
      setLoadingStep("분석 중 오류가 발생했습니다.");
      setLoading(false);
      return;
    }

    setAnalysis(result.analysis);
    setExercises(result.exercises);

    // Fetch videos for each exercise
    setLoadingStep("운동 영상 불러오는 중...");
    const vMap: Record<string, VideoResult[]> = {};
    const sMap: Record<string, string> = {};
    await Promise.all(
      result.exercises.map(async (ex) => {
        try {
          const res = await api.searchVideos(ex.youtube_query, 2);
          if (res.videos.length > 0) vMap[ex.id] = res.videos;
          if (res.search_url) sMap[ex.id] = res.search_url;
        } catch {}
      })
    );
    setVideoMap(vMap);
    setSearchUrlMap(sMap);
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

        {/* Exercise video recommendations */}
        {exercises.length > 0 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-[#101c2a]">추천 운동 영상</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exercises.map((ex) => {
                const videos = videoMap[ex.id] ?? [];
                const searchUrl = searchUrlMap[ex.id];
                return (
                  <div key={ex.id} className="bg-white border border-[#c1c7c9] rounded-lg overflow-hidden flex flex-col">
                    {/* Video thumbnails */}
                    {videos.length > 0 ? (
                      <div className="flex gap-1 p-2 bg-[#f8f9ff]">
                        {videos.map((v) => (
                          <a key={v.video_id} href={v.url} target="_blank" rel="noopener noreferrer" className="flex-1 relative group">
                            <img
                              src={v.thumbnail}
                              alt={v.title}
                              className="w-full rounded object-cover aspect-video group-hover:opacity-80 transition-opacity"
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="material-symbols-outlined text-white bg-black/60 rounded-full p-1" style={{ fontSize: "24px" }}>
                                play_circle
                              </span>
                            </div>
                            <p className="text-[10px] text-[#42484a] mt-1 line-clamp-2 leading-tight">{v.title}</p>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-[#f8f9ff] aspect-video flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#c1c7c9]" style={{ fontSize: "40px" }}>play_circle</span>
                      </div>
                    )}

                    {/* Exercise info */}
                    <div className="p-4 flex flex-col gap-2 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-[#101c2a]">{ex.name}</h3>
                        <div className="flex gap-1 shrink-0">
                          <span className="px-1.5 py-0.5 bg-[#eff4ff] text-[#235881] text-[10px] rounded">
                            {"⭐".repeat(Math.min(ex.difficulty, 3))}
                          </span>
                          <span className="px-1.5 py-0.5 bg-[#eff4ff] text-[#235881] text-[10px] rounded">
                            {ex.duration_minutes}분
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-[#42484a] leading-relaxed">{ex.description}</p>
                      {ex.reason && (
                        <p className="text-xs text-[#2f628c] bg-[#eff4ff] rounded px-2.5 py-1.5 leading-relaxed">
                          💡 {ex.reason}
                        </p>
                      )}

                      {/* YouTube search fallback */}
                      {searchUrl && (
                        <a
                          href={searchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-auto flex items-center gap-1.5 text-xs text-[#2f628c] hover:underline"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>open_in_new</span>
                          YouTube에서 더 보기
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
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
