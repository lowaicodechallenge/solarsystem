"use client";
import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { analyzePosture } from "@/lib/poseAnalysis";
import { getScoreColor, getScoreLabel } from "@/lib/utils";

type ScanStep = "preview" | "countdown_front" | "countdown_side" | "done";

type CaptureResult = {
  score: number;
  issues: Array<{ severity: string; message: string }>;
};

const COUNTDOWN_SEC = 12;

function ScanPageInner() {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frontRef  = useRef<CaptureResult | null>(null);

  const [step,      setStep]      = useState<ScanStep>("preview");
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC);
  const [active,    setActive]    = useState(false);
  const [results,   setResults]   = useState<{ front: CaptureResult | null; side: CaptureResult | null }>({ front: null, side: null });

  const pose = usePoseDetection(videoRef, canvasRef, "posture", active);

  // keypoints를 ref로 유지 — countdown effect의 dependency에서 제외하기 위해
  const keypointsRef = useRef(pose.keypoints);
  useEffect(() => { keypointsRef.current = pose.keypoints; }, [pose.keypoints]);

  // Auto-start webcam on mount
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
    } catch {
      alert("웹캠 접근 권한이 필요합니다.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  // Countdown + capture logic
  // pose.keypoints를 dependency에서 제외 — 매 프레임 재실행으로 인한 타이머 리셋 방지
  useEffect(() => {
    if (step !== "countdown_front" && step !== "countdown_side") return;

    if (countdown <= 0) {
      const analysis = analyzePosture(keypointsRef.current);
      const result: CaptureResult = { score: analysis.score, issues: analysis.issues };

      if (step === "countdown_front") {
        frontRef.current = result;
        setCountdown(COUNTDOWN_SEC);
        setStep("countdown_side");
      } else {
        const combined = { front: frontRef.current, side: result };
        setResults(combined);
        const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const dateKST = kst.toUTCString().slice(0, 16);
        localStorage.setItem(
          "fitai_posture_analysis",
          JSON.stringify({ date: dateKST, ...combined })
        );
        stopCamera();
        setStep("done");
      }
      return;
    }

    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, countdown, stopCamera]);

  const handleStartCapture = () => {
    setCountdown(COUNTDOWN_SEC);
    setStep("countdown_front");
  };

  const isCounting   = step === "countdown_front" || step === "countdown_side";
  const captureLabel = step === "countdown_front" ? "정면 촬영" : "측면 촬영";
  const captureHint  = step === "countdown_front"
    ? "카메라를 정면으로 바라보세요"
    : "카메라를 옆으로 돌아서 측면이 보이게 서세요";

  return (
    <div className="min-h-screen bg-[#F8F9FF] px-6 pb-10">
      {/* Header */}
      <div className="flex items-center py-5">
        <Link
          href="/scanpose"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#c1c7c9] text-[#42484a] text-xs rounded-lg hover:bg-[#eff4ff] transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>arrow_back</span>
          돌아가기
        </Link>
        <h1 className="text-lg font-semibold text-[#101c2a] ml-3">자세 분석</h1>
      </div>

      {step === "done" ? (
        /* ── 완료 화면 ── */
        <div className="flex flex-col gap-6 max-w-2xl mx-auto">
          <div className="text-center py-4">
            <span className="material-symbols-outlined text-[#2f628c] block mb-2" style={{ fontSize: "48px" }}>
              check_circle
            </span>
            <h2 className="text-2xl font-bold text-[#101c2a]">분석 완료</h2>
            <p className="text-sm text-[#42484a] mt-1">자세 분석 결과가 저장됐어요.</p>
          </div>

          {/* Front result */}
          {results.front && (
            <div className="bg-white border border-[#c1c7c9] rounded-lg p-4">
              <p className="text-xs font-semibold text-[#2f628c] mb-3 uppercase tracking-wider">정면 분석</p>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl font-bold" style={{ color: getScoreColor(results.front.score) }}>
                  {results.front.score.toFixed(0)}
                </span>
                <span className="text-sm text-[#42484a]">{getScoreLabel(results.front.score)}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {results.front.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span>{issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🟢"}</span>
                    <span className="text-[#42484a]">{issue.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Side result */}
          {results.side && (
            <div className="bg-white border border-[#c1c7c9] rounded-lg p-4">
              <p className="text-xs font-semibold text-[#2f628c] mb-3 uppercase tracking-wider">측면 분석</p>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl font-bold" style={{ color: getScoreColor(results.side.score) }}>
                  {results.side.score.toFixed(0)}
                </span>
                <span className="text-sm text-[#42484a]">{getScoreLabel(results.side.score)}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {results.side.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span>{issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🟢"}</span>
                    <span className="text-[#42484a]">{issue.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link
            href="/scanpose"
            className="w-full bg-[#2f628c] text-white py-3 rounded-lg text-sm font-semibold text-center hover:opacity-90 transition-opacity"
          >
            결과 확인하러 가기
          </Link>
        </div>
      ) : (
        /* ── 웹캠 화면 ── */
        <div className="flex flex-col gap-4">
          <div className="relative bg-black rounded-2xl overflow-hidden" style={{ height: "67vh" }}>
            <video
              ref={videoRef}
              className="w-full h-full object-cover scale-x-[-1]"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="pose-canvas scale-x-[-1]" />

            {/* 카운트다운 오버레이 */}
            {isCounting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30">
                <div className="bg-black/60 px-8 py-3 rounded-2xl text-center">
                  <p className="text-white text-3xl font-extrabold tracking-wide">{captureLabel}</p>
                  <p className="text-white/70 text-sm mt-1">{captureHint}</p>
                </div>
                <span
                  className="text-white font-black leading-none"
                  style={{ fontSize: "120px", textShadow: "0 4px 24px rgba(0,0,0,0.6)" }}
                >
                  {countdown}
                </span>
              </div>
            )}

            {/* preview 상태: 촬영 시작 버튼 */}
            {step === "preview" && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                <button
                  onClick={handleStartCapture}
                  className="px-10 py-3 bg-[#2f628c] hover:opacity-90 text-white font-bold rounded-xl text-sm transition-all shadow-lg"
                >
                  촬영 시작
                </button>
              </div>
            )}
          </div>

          {/* 안내 텍스트 */}
          {step === "preview" && (
            <div className="bg-white border border-[#c1c7c9] rounded-lg px-4 py-3 text-sm text-[#42484a] flex items-start gap-2">
              <span className="material-symbols-outlined text-[#2f628c] shrink-0" style={{ fontSize: "18px" }}>info</span>
              <span>
                카메라에서 <strong>1~2m</strong> 떨어진 곳에 서주세요.
                촬영 시작 후 <strong>정면 12초 → 측면 12초</strong> 순서로 자동 캡처됩니다.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-[#42484a]">로딩 중...</div>}>
      <ScanPageInner />
    </Suspense>
  );
}
