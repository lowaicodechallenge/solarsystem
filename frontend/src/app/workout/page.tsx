"use client";
import { useState, Suspense, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import PoseDetector from "@/components/PoseDetector";
import WorkoutVideo from "@/components/WorkoutVideo";
import Chatbot from "@/components/Chatbot";
import { EXERCISES, USER_ID } from "@/lib/utils";
import type { Keypoint } from "@tensorflow-models/pose-detection";

// CoachVideo uses canvas + requestAnimationFrame — disable SSR
const CoachVideo = dynamic(() => import("@/components/CoachVideo"), { ssr: false });

function WorkoutPageInner() {
  const params = useSearchParams();
  const initialEx = params.get("exercise") ?? "squat";
  const [exercise, setExercise] = useState(initialEx);
  const [tab, setTab] = useState<"coach" | "routine" | "chat">("coach");
  const [poseData, setPoseData] = useState<{
    score: number;
    issues: string[];
    signature: number[];
    keypoints?: Keypoint[];
  } | null>(null);
  const [coachSimilarity, setCoachSimilarity] = useState(0);
  const [symptoms, setSymptoms] = useState(
    typeof window !== "undefined" ? localStorage.getItem("fitai_symptoms") ?? "" : ""
  );

  const handleAnalysis = useCallback(
    (data: { score: number; issues: string[]; signature: number[] }) => {
      setPoseData((prev) => ({ ...prev, ...data }));
    },
    []
  );

  const poseContext = poseData
    ? { exercise_type: exercise, score: poseData.score, issues: poseData.issues }
    : {};

  const exInfo = EXERCISES.find((e) => e.id === exercise);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Exercise Selector */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {EXERCISES.map((ex) => (
          <button
            key={ex.id}
            onClick={() => setExercise(ex.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border ${
              exercise === ex.id
                ? "border-primary-500 bg-primary-500/10 text-primary-400"
                : "border-white/5 bg-dark-700 text-gray-400 hover:text-white hover:border-white/20"
            }`}
          >
            <span>{ex.emoji}</span>
            {ex.name}
          </button>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-4 bg-dark-700 rounded-xl p-1">
        {([
          ["coach", "🤸 코치와 함께"],
          ["routine", "📋 오늘의 루틴"],
          ["chat", "💬 AI 코치"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id
                ? "bg-primary-500/20 text-primary-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* COACH TAB — Side-by-side coach + user webcam */}
      {tab === "coach" && (
        <div className="space-y-4">
          {/* Split view */}
          <div className="grid grid-cols-2 gap-3">
            {/* Coach panel */}
            <div className="space-y-1">
              <p className="text-xs text-gray-500 font-medium px-1">AI 코치 시범</p>
              <CoachVideo
                exercise={exercise}
                userKeypoints={poseData?.keypoints}
                userCanvasSize={{ w: 640, h: 480 }}
                onSimilarity={setCoachSimilarity}
              />
            </div>

            {/* User webcam panel */}
            <div className="space-y-1">
              <p className="text-xs text-gray-500 font-medium px-1">내 자세</p>
              <PoseDetector
                exercise={exercise}
                userId={USER_ID}
                onAnalysis={handleAnalysis}
              />
            </div>
          </div>

          {/* Combined score banner */}
          <div className="glass-card rounded-2xl p-4 flex items-center gap-6">
            <div className="text-center flex-1">
              <p className="text-xs text-gray-500 mb-1">자세 점수</p>
              <p className={`text-2xl font-bold ${poseData ? "" : "text-gray-600"}`}
                 style={{ color: poseData ? `hsl(${poseData.score * 1.2},80%,55%)` : undefined }}>
                {poseData ? poseData.score.toFixed(0) : "--"}
              </p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center flex-1">
              <p className="text-xs text-gray-500 mb-1">코치 일치율</p>
              <p className="text-2xl font-bold text-primary-400">
                {Math.round(coachSimilarity * 100)}%
              </p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-1">주요 교정</p>
              <p className="text-xs text-amber-400 line-clamp-2">
                {poseData?.issues.find((i) => !i.includes("완벽")) ?? "운동을 시작하세요!"}
              </p>
            </div>
          </div>

          {/* Exercise guide */}
          <div className="glass-card rounded-2xl p-4">
            <p className="text-sm font-semibold text-white mb-2">
              {exInfo?.emoji} {exInfo?.name} 핵심 포인트
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
              {exercise === "squat" && (
                <>
                  <div className="flex gap-1.5"><span className="text-primary-500">•</span>무릎이 발끝 방향을 따라가게</div>
                  <div className="flex gap-1.5"><span className="text-primary-500">•</span>허리는 중립 자세 유지</div>
                  <div className="flex gap-1.5"><span className="text-primary-500">•</span>무릎 안쪽 쏠림 주의</div>
                  <div className="flex gap-1.5"><span className="text-primary-500">•</span>발뒤꿈치로 밀며 올라오기</div>
                </>
              )}
              {exercise === "pushup" && (
                <>
                  <div className="flex gap-1.5"><span className="text-primary-500">•</span>몸 전체를 일직선으로</div>
                  <div className="flex gap-1.5"><span className="text-primary-500">•</span>팔꿈치 45도 유지</div>
                  <div className="flex gap-1.5"><span className="text-primary-500">•</span>코어에 힘 유지</div>
                  <div className="flex gap-1.5"><span className="text-primary-500">•</span>흉근으로 밀어 올리기</div>
                </>
              )}
              {exercise === "plank" && (
                <>
                  <div className="flex gap-1.5"><span className="text-primary-500">•</span>머리부터 발끝 일직선</div>
                  <div className="flex gap-1.5"><span className="text-primary-500">•</span>복근과 둔근에 힘 유지</div>
                  <div className="flex gap-1.5"><span className="text-primary-500">•</span>엉덩이 처짐 금지</div>
                  <div className="flex gap-1.5"><span className="text-primary-500">•</span>고른 호흡 유지</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "routine" && (
        <div className="max-w-2xl">
          <WorkoutVideo
            userId={USER_ID}
            poseSummary={poseData?.issues.join(", ")}
            postureIssues={poseData?.issues ?? []}
          />
        </div>
      )}

      {tab === "chat" && (
        <div className="max-w-2xl space-y-4">
          <Chatbot
            userId={USER_ID}
            poseContext={poseContext}
            onSymptomsUpdate={(s) => {
              setSymptoms(s);
              localStorage.setItem("fitai_symptoms", s);
            }}
          />
          {symptoms && (
            <div className="glass-card rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-2">AI가 반영 중인 나의 증상</p>
              <div className="flex flex-wrap gap-1.5">
                {symptoms.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                  <span key={s} className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkoutPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">로딩 중...</div>}>
      <WorkoutPageInner />
    </Suspense>
  );
}
