"use client";
import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { analyzePosture } from "@/lib/poseAnalysis";
import { getScoreColor, getScoreLabel, USER_ID } from "@/lib/utils";
import { api } from "@/lib/api";

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

  const keypointsRef = useRef(pose.keypoints);
  useEffect(() => { keypointsRef.current = pose.keypoints; }, [pose.keypoints]);

  const scoresBufferRef = useRef<number[]>([]);
  useEffect(() => {
    if (!pose.isDetecting) return;
    scoresBufferRef.current = [...scoresBufferRef.current, pose.score].slice(-45);
  }, [pose.score, pose.isDetecting]);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step !== "countdown_front" && step !== "countdown_side") return;

    if (countdown <= 0) {
      const analysis = analyzePosture(keypointsRef.current, step === "countdown_side");
      const buf = scoresBufferRef.current;
      const avgScore =
        buf.length > 0
          ? Math.round(buf.reduce((a, b) => a + b, 0) / buf.length)
          : analysis.score;
      scoresBufferRef.current = [];
      const result: CaptureResult = { score: avgScore, issues: analysis.issues };

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

        const frontScore = frontRef.current?.score ?? result.score;
        const combinedScore = Math.round((frontScore + result.score) / 2);
        const params = new URLSearchParams();
        params.set("user_id", USER_ID);
        params.set("exercise_type", "posture_scan");
        params.set("duration", "24");
        params.set("avg_score", String(combinedScore));
        result.issues.forEach((i) => params.append("corrections", i.message));
        api.savePoseSession(params).catch(() => {});

        stopCamera();
        setStep("done");
      }
      return;
    }

    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [step, countdown, stopCamera]);

  const handleStartCapture = () => {
    setCountdown(COUNTDOWN_SEC);
    setStep("countdown_front");
  };

  const isCounting   = step === "countdown_front" || step === "countdown_side";
  const captureLabel = step === "countdown_front" ? "정면 촬영" : "측면 촬영";
  const captureHint  =
    step === "countdown_front"
      ? "카메라를 정면으로 바라보세요"
      : "카메라를 옆으로 돌아서 측면이 보이게 서세요";

  /* Progress ring for countdown */
  const ringR = 36;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - countdown / COUNTDOWN_SEC);

  return (
    <div className="fixed inset-0 z-[100] bg-[#050505] flex flex-col">
      {/* HUD top bar */}
      <div className="flex items-center justify-between px-5 py-4 bg-[#050505]/90 backdrop-blur-xl border-b border-white/5 shrink-0">
        <Link
          href="/scanpose"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 text-[#c7c4da] text-xs rounded-lg hover:bg-white/10 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>arrow_back</span>
          돌아가기
        </Link>

        <div className="text-center">
          <p className="font-oswald text-sm font-bold text-[#c3c0ff] uppercase tracking-widest">
            자세 스캔
          </p>
          {isCounting && (
            <p className="text-[10px] text-[#c7c4da]/40 mt-0.5">{captureLabel}</p>
          )}
        </div>

        {/* step indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              step === "countdown_front" || step === "preview"
                ? "bg-[#c3c0ff]"
                : "bg-white/20"
            }`}
          />
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              step === "countdown_side" ? "bg-[#c3c0ff]" : "bg-white/20"
            }`}
          />
        </div>
      </div>

      {step === "done" ? (
        /* ── 완료 화면 ── */
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="max-w-2xl mx-auto flex flex-col gap-5">
            <div className="text-center py-4">
              <span
                className="material-symbols-outlined text-[#00e293] block mb-2"
                style={{ fontSize: "52px", fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
              <h2 className="font-oswald text-3xl font-bold text-[#e5e2e1] uppercase">분석 완료</h2>
              <p className="text-sm text-[#c7c4da]/50 mt-1">자세 분석 결과가 저장됐어요.</p>
            </div>

            {results.front && (
              <div className="glass-card p-5">
                <p className="text-[10px] font-semibold text-[#c3c0ff]/60 mb-3 uppercase tracking-widest">
                  정면 분석
                </p>
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="text-4xl font-bold"
                    style={{ color: getScoreColor(results.front.score) }}
                  >
                    {results.front.score.toFixed(0)}
                  </span>
                  <div>
                    <p className="text-xs text-[#c7c4da]/40">점</p>
                    <p className="text-xs text-[#c7c4da]/60">{getScoreLabel(results.front.score)}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {results.front.issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span
                        className={
                          issue.severity === "error"
                            ? "text-[#ffb4ab]"
                            : issue.severity === "warning"
                            ? "text-amber-300"
                            : "text-[#00e293]"
                        }
                      >
                        {issue.severity === "error" ? "●" : issue.severity === "warning" ? "◑" : "○"}
                      </span>
                      <span className="text-[#c7c4da]/70">{issue.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.side && (
              <div className="glass-card p-5">
                <p className="text-[10px] font-semibold text-[#c3c0ff]/60 mb-3 uppercase tracking-widest">
                  측면 분석
                </p>
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="text-4xl font-bold"
                    style={{ color: getScoreColor(results.side.score) }}
                  >
                    {results.side.score.toFixed(0)}
                  </span>
                  <div>
                    <p className="text-xs text-[#c7c4da]/40">점</p>
                    <p className="text-xs text-[#c7c4da]/60">{getScoreLabel(results.side.score)}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {results.side.issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span
                        className={
                          issue.severity === "error"
                            ? "text-[#ffb4ab]"
                            : issue.severity === "warning"
                            ? "text-amber-300"
                            : "text-[#00e293]"
                        }
                      >
                        {issue.severity === "error" ? "●" : issue.severity === "warning" ? "◑" : "○"}
                      </span>
                      <span className="text-[#c7c4da]/70">{issue.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Link
              href="/scanpose"
              className="w-full py-4 rounded-xl text-sm font-bold text-[#050505] bg-[#c3c0ff] hover:bg-white transition-colors text-center"
            >
              결과 확인하러 가기
            </Link>
          </div>
        </div>
      ) : (
        /* ── 웹캠 화면 ── */
        <div className="flex-1 relative overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover scale-x-[-1]"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="pose-canvas scale-x-[-1]" />

          {/* scan-line during countdown */}
          {isCounting && <div className="scan-line" />}

          {/* Preview info */}
          {step === "preview" && (
            <div className="absolute top-4 left-4 right-4 z-10">
              <div className="glass-card px-4 py-3 flex items-start gap-2 text-sm text-[#c7c4da]/60">
                <span
                  className="material-symbols-outlined text-[#c3c0ff] shrink-0"
                  style={{ fontSize: "18px" }}
                >
                  info
                </span>
                <span>
                  카메라에서{" "}
                  <strong className="text-[#c3c0ff]">1~2m</strong> 떨어진 곳에 서주세요.
                  촬영 시작 후{" "}
                  <strong className="text-[#c3c0ff]">정면 12초 → 측면 12초</strong> 순서로
                  자동 캡처됩니다.
                </span>
              </div>
            </div>
          )}

          {/* Countdown overlay */}
          {isCounting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 pointer-events-none z-10">
              {/* label */}
              <div className="hud-border glass-card px-8 py-3 text-center">
                <p className="font-oswald text-2xl font-bold text-[#c3c0ff] uppercase">
                  {captureLabel}
                </p>
                <p className="text-[#c7c4da]/50 text-sm mt-1">{captureHint}</p>
              </div>

              {/* countdown ring + number */}
              <div className="relative flex items-center justify-center">
                <svg width="96" height="96" className="-rotate-90">
                  <circle
                    cx="48" cy="48" r={ringR}
                    fill="none"
                    stroke="rgba(195,192,255,0.15)"
                    strokeWidth="4"
                  />
                  <circle
                    cx="48" cy="48" r={ringR}
                    fill="none"
                    stroke="#c3c0ff"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={ringC}
                    strokeDashoffset={ringOffset}
                    style={{ transition: "stroke-dashoffset 1s linear" }}
                  />
                </svg>
                <span
                  className="absolute font-oswald font-black text-[#c3c0ff]"
                  style={{ fontSize: "36px" }}
                >
                  {countdown}
                </span>
              </div>
            </div>
          )}

          {/* Preview start button */}
          {step === "preview" && (
            <div className="absolute bottom-10 left-0 right-0 flex justify-center z-10">
              <button
                onClick={handleStartCapture}
                className="px-12 py-4 rounded-2xl text-sm font-bold text-[#050505] bg-[#c3c0ff] hover:bg-white transition-colors shadow-[0_0_40px_rgba(195,192,255,0.3)]"
              >
                촬영 시작
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-[#050505] flex items-center justify-center text-[#c7c4da]/40">
          로딩 중...
        </div>
      }
    >
      <ScanPageInner />
    </Suspense>
  );
}
