"use client";
import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { analyzePosture, drawPoseSkeleton, type Keypoint } from "@/lib/poseAnalysis";
import { getScoreColor, getScoreLabel, USER_ID } from "@/lib/utils";
import { api } from "@/lib/api";

type ScanStep =
  | "upload"
  | "analyzing"
  | "webcam_preview"
  | "countdown_front"
  | "countdown_side"
  | "done";

type CaptureResult = {
  score: number;
  issues: Array<{ severity: string; message: string }>;
};

const COUNTDOWN_SEC = 12;

const LANDMARK_NAMES = [
  "nose", "left_eye_inner", "left_eye", "left_eye_outer",
  "right_eye_inner", "right_eye", "right_eye_outer",
  "left_ear", "right_ear", "mouth_left", "mouth_right",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_pinky", "right_pinky",
  "left_index", "right_index", "left_thumb", "right_thumb",
  "left_hip", "right_hip", "left_knee", "right_knee",
  "left_ankle", "right_ankle", "left_heel", "right_heel",
  "left_foot_index", "right_foot_index",
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function analyzeImageWithPose(
  objectUrl: string,
  isSideView: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  landmarker: any
): Promise<{ result: CaptureResult | null; dataUrl: string }> {
  const img = await loadImage(objectUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  try {
    const results = landmarker.detect(img);
    if (results.landmarks?.length > 0) {
      const keypoints: Keypoint[] = results.landmarks[0].map(
        (lm: { x: number; y: number; z: number; visibility?: number }, i: number) => ({
          x: lm.x * w,
          y: lm.y * h,
          z: lm.z * w,
          score: lm.visibility ?? 1,
          name: LANDMARK_NAMES[i],
        })
      );
      const analysis = analyzePosture(keypoints, isSideView);
      drawPoseSkeleton(ctx, keypoints, analysis.issues, w, h);
      return {
        result: { score: analysis.score, issues: analysis.issues },
        dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      };
    }
  } catch {
    // detection failed — return image without landmarks
  }

  return { result: null, dataUrl: canvas.toDataURL("image/jpeg", 0.92) };
}

function UploadCard({
  label,
  url,
  inputRef,
  onChange,
}: {
  label: string;
  url: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg font-semibold text-[#c3c0ff] uppercase tracking-wider">{label}</p>
      <div
        className="relative rounded-xl border-2 border-dashed border-white/10 overflow-hidden cursor-pointer hover:border-[#c3c0ff]/40 transition-colors bg-white/[0.02]"
        style={{ aspectRatio: "3/4" }}
        onClick={() => inputRef.current?.click()}
      >
        {url ? (
          <>
            <img src={url} alt={label} className="absolute inset-0 w-full h-full object-contain" />
            <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 text-[13px] text-[#c3c0ff]">
              변경
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[#c7c4da]/30">
            <span className="material-symbols-outlined" style={{ fontSize: "52px" }}>
              add_photo_alternate
            </span>
            <span className="text-base">클릭해서 업로드</span>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
    </div>
  );
}

function IssueRow({ issue }: { issue: { severity: string; message: string } }) {
  return (
    <div className="flex items-start gap-2 text-base">
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
  );
}

function ScanPageInner() {
  // ── 공통 상태 ────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<ScanStep>("upload");
  const [results, setResults] = useState<{
    front: CaptureResult | null;
    side: CaptureResult | null;
    frontDataUrl: string | null;
    sideDataUrl: string | null;
  }>({ front: null, side: null, frontDataUrl: null, sideDataUrl: null });

  // ── 업로드 전용 ───────────────────────────────────────────────────────────────
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [sideUrl, setSideUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const sideInputRef = useRef<HTMLInputElement>(null);

  // ── 웹캠 전용 ────────────────────────────────────────────────────────────────
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frontRef  = useRef<CaptureResult | null>(null);
  const [webcamActive, setWebcamActive] = useState(false);
  const [countdown, setCountdown]       = useState(COUNTDOWN_SEC);
  const scoresBufferRef = useRef<number[]>([]);

  const pose = usePoseDetection(videoRef, canvasRef, "posture", webcamActive);
  const keypointsRef = useRef(pose.keypoints);

  useEffect(() => { keypointsRef.current = pose.keypoints; }, [pose.keypoints]);

  useEffect(() => {
    if (!pose.isDetecting) return;
    scoresBufferRef.current = [...scoresBufferRef.current, pose.score].slice(-45);
  }, [pose.score, pose.isDetecting]);

  // 페이지 언마운트 시 스트림 정리
  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setWebcamActive(false);
  }, []);

  // 카운트다운 처리
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
        const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const dateKST = kst.toUTCString().slice(0, 16);
        localStorage.setItem(
          "fitai_posture_analysis",
          JSON.stringify({ date: dateKST, front: combined.front, side: combined.side })
        );
        const frontScore = combined.front?.score ?? result.score;
        const combinedScore = Math.round((frontScore + result.score) / 2);
        const params = new URLSearchParams();
        params.set("user_id", USER_ID);
        params.set("exercise_type", "posture_scan");
        params.set("duration", "24");
        params.set("avg_score", String(combinedScore));
        result.issues.forEach((i) => params.append("corrections", i.message));
        api.savePoseSession(params).catch(() => {});
        setResults({ front: combined.front, side: result, frontDataUrl: null, sideDataUrl: null });
        stopCamera();
        setStep("done");
      }
      return;
    }

    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [step, countdown, stopCamera]);

  // ── 웹캠 핸들러 ───────────────────────────────────────────────────────────────
  const handleStartWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      // video 요소는 step 전환 후 DOM에 마운트되므로 여기서 srcObject를 설정하면 null
      // → useEffect에서 step === "webcam_preview" 시점에 연결
      setWebcamActive(true);
      setStep("webcam_preview");
    } catch {
      alert("웹캠 접근 권한이 필요합니다.");
    }
  }, []);

  // webcam_preview로 전환되어 <video>가 DOM에 마운트된 뒤 스트림 연결
  useEffect(() => {
    if (step === "webcam_preview" && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [step]);

  const handleCancelWebcam = useCallback(() => {
    stopCamera();
    setStep("upload");
    setCountdown(COUNTDOWN_SEC);
    frontRef.current = null;
    scoresBufferRef.current = [];
  }, [stopCamera]);

  const handleStartCapture = useCallback(() => {
    setCountdown(COUNTDOWN_SEC);
    setStep("countdown_front");
  }, []);

  // ── 업로드 핸들러 ─────────────────────────────────────────────────────────────
  const handleFrontChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setFrontUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
  }, []);

  const handleSideChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSideUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!frontUrl || !sideUrl) return;
    setStep("analyzing");
    setErrorMsg(null);
    try {
      const { PoseLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numPoses: 1,
      });

      const { result: frontResult, dataUrl: frontDataUrl } =
        await analyzeImageWithPose(frontUrl, false, landmarker);
      const { result: sideResult, dataUrl: sideDataUrl } =
        await analyzeImageWithPose(sideUrl, true, landmarker);

      landmarker.close();

      setResults({ front: frontResult, side: sideResult, frontDataUrl, sideDataUrl });

      const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const dateKST = kst.toUTCString().slice(0, 16);
      localStorage.setItem(
        "fitai_posture_analysis",
        JSON.stringify({ date: dateKST, front: frontResult, side: sideResult })
      );

      if (frontResult || sideResult) {
        const frontScore = frontResult?.score ?? 0;
        const sideScore  = sideResult?.score  ?? 0;
        const combinedScore =
          frontResult && sideResult
            ? Math.round((frontScore + sideScore) / 2)
            : Math.round(frontResult ? frontScore : sideScore);
        const params = new URLSearchParams();
        params.set("user_id", USER_ID);
        params.set("exercise_type", "posture_scan");
        params.set("duration", "0");
        params.set("avg_score", String(combinedScore));
        (sideResult?.issues ?? frontResult?.issues ?? []).forEach((i) =>
          params.append("corrections", i.message)
        );
        api.savePoseSession(params).catch(() => {});
      }

      setStep("done");
    } catch {
      setErrorMsg("분석 중 오류가 발생했습니다. 다시 시도해 주세요.");
      setStep("upload");
    }
  }, [frontUrl, sideUrl]);

  const handleReset = useCallback(() => {
    setStep("upload");
    if (frontUrl) URL.revokeObjectURL(frontUrl);
    if (sideUrl)  URL.revokeObjectURL(sideUrl);
    setFrontUrl(null);
    setSideUrl(null);
    setResults({ front: null, side: null, frontDataUrl: null, sideDataUrl: null });
  }, [frontUrl, sideUrl]);

  // ── 웹캠 UI 계산값 ────────────────────────────────────────────────────────────
  const isWebcamStep = step === "webcam_preview" || step === "countdown_front" || step === "countdown_side";
  const isCounting   = step === "countdown_front" || step === "countdown_side";
  const captureLabel = step === "countdown_front" ? "정면 촬영" : "측면 촬영";
  const captureHint  =
    step === "countdown_front"
      ? "카메라를 정면으로 바라보세요"
      : "오른쪽이 카메라에 찍히도록 서주세요";

  const ringR      = 36;
  const ringC      = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - countdown / COUNTDOWN_SEC);

  // ── 렌더 ─────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[100] bg-[#050505] flex flex-col">
      {/* HUD top bar */}
      <div className="flex items-center justify-between px-5 py-5 bg-[#050505]/90 backdrop-blur-xl border-b border-white/5 shrink-0">
        {isWebcamStep ? (
          <button
            onClick={handleCancelWebcam}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-[#c7c4da] text-sm rounded-lg hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>arrow_back</span>
            돌아가기
          </button>
        ) : (
          <Link
            href="/scanpose"
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-[#c7c4da] text-sm rounded-lg hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>arrow_back</span>
            돌아가기
          </Link>
        )}

        <div className="text-center">
          <p
            className="font-oswald text-xl font-bold text-[#c3c0ff] uppercase"
            style={{ letterSpacing: "0.02em" }}
          >
            자세 스캔
          </p>
          {step === "done"    && <p className="text-sm  text-[#c7c4da]/40 mt-0.5">분석 완료</p>}
          {isCounting         && <p className="text-[10px] text-[#c7c4da]/40 mt-0.5">{captureLabel}</p>}
        </div>

        {/* 우측 균형용 빈 공간 */}
        <div className="invisible flex items-center gap-2 px-4 py-2 text-sm">
          <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>arrow_back</span>
          돌아가기
        </div>
      </div>

      {/* ── 분석 중 ── */}
      {step === "analyzing" ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="w-16 h-16 border-2 border-[#c3c0ff] border-t-transparent rounded-full animate-spin" />
          <p className="text-lg text-[#c7c4da]/60">AI가 자세를 분석하고 있어요...</p>
          <p className="text-sm text-[#c7c4da]/30">정면 및 측면 사진 처리 중</p>
        </div>

      /* ── 완료 화면 ── */
      ) : step === "done" ? (
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-3xl mx-auto flex flex-col gap-6">
            <div className="text-center py-2">
              <span
                className="material-symbols-outlined text-[#00e293] block mb-2"
                style={{ fontSize: "57px", fontVariationSettings: "'FILL' 1" }}
              >
                check_circle
              </span>
              <h2 className="font-oswald text-3xl font-bold text-[#e5e2e1] uppercase">분석 완료</h2>
              <p className="text-lg text-[#c7c4da]/50 mt-1">자세 분석 결과가 저장됐어요.</p>
              <p className="text-xs text-yellow-300/50 mt-2">
                ⚠️ 통증이 있다면 운동 전 의료 전문가와 상담하세요.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 정면 */}
              <div className="glass-card p-5 flex flex-col gap-4">
                <p className="text-[13px] font-semibold text-[#c3c0ff]/60 uppercase tracking-widest">정면 분석</p>
                {results.frontDataUrl && (
                  <img src={results.frontDataUrl} alt="정면 분석" className="w-full rounded-lg" />
                )}
                {results.front ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-4xl font-bold" style={{ color: getScoreColor(results.front.score) }}>
                        {results.front.score.toFixed(0)}
                      </span>
                      <div>
                        <p className="text-sm text-[#c7c4da]/40">점</p>
                        <p className="text-sm text-[#c7c4da]/60">{getScoreLabel(results.front.score)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {results.front.issues.map((issue, i) => <IssueRow key={i} issue={issue} />)}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[#c7c4da]/40">사람을 감지하지 못했습니다.</p>
                )}
              </div>

              {/* 측면 */}
              <div className="glass-card p-5 flex flex-col gap-4">
                <p className="text-[13px] font-semibold text-[#c3c0ff]/60 uppercase tracking-widest">측면 분석</p>
                {results.sideDataUrl && (
                  <img src={results.sideDataUrl} alt="측면 분석" className="w-full rounded-lg" />
                )}
                {results.side ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-4xl font-bold" style={{ color: getScoreColor(results.side.score) }}>
                        {results.side.score.toFixed(0)}
                      </span>
                      <div>
                        <p className="text-sm text-[#c7c4da]/40">점</p>
                        <p className="text-sm text-[#c7c4da]/60">{getScoreLabel(results.side.score)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {results.side.issues.map((issue, i) => <IssueRow key={i} issue={issue} />)}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[#c7c4da]/40">사람을 감지하지 못했습니다.</p>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleReset}
                className="flex-1 py-4 rounded-2xl text-base font-bold text-[#c3c0ff] border border-[#c3c0ff]/30 hover:bg-[#c3c0ff]/10 transition-colors"
              >
                다시 분석하기
              </button>
              <Link
                href="/scanpose"
                className="flex-1 py-4 rounded-2xl text-base font-bold text-[#050505] bg-[#c3c0ff] hover:bg-white transition-colors text-center"
              >
                결과 확인하러 가기
              </Link>
            </div>
          </div>
        </div>

      /* ── 웹캠 화면 ── */
      ) : isWebcamStep ? (
        <div className="flex-1 relative overflow-hidden">
          <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" playsInline muted />
          <canvas ref={canvasRef} className="pose-canvas scale-x-[-1]" />

          {isCounting && <div className="scan-line" />}

          {/* 안내 (미리보기) */}
          {step === "webcam_preview" && (
            <div className="absolute top-4 left-4 right-4 z-10">
              <div className="glass-card px-4 py-3 flex items-start gap-2 text-sm text-[#c7c4da]/60">
                <span className="material-symbols-outlined text-[#c3c0ff] shrink-0" style={{ fontSize: "18px" }}>info</span>
                <span>
                  카메라에서 <strong className="text-[#c3c0ff]">1~2m</strong> 떨어진 곳에 서주세요.
                  촬영 시작 후 <strong className="text-[#c3c0ff]">정면 12초 → 측면 12초</strong> 순서로 자동 캡처됩니다.
                  측면 촬영 시 <strong className="text-amber-300">오른쪽이 카메라에 찍히도록</strong> 서주세요.
                </span>
              </div>
            </div>
          )}

          {/* 카운트다운 오버레이 */}
          {isCounting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 pointer-events-none z-10">
              <div className="hud-border glass-card px-8 py-3 text-center">
                <p className="font-oswald text-2xl font-bold text-[#c3c0ff] uppercase">{captureLabel}</p>
                <p className="text-[#c7c4da]/50 text-sm mt-1">{captureHint}</p>
              </div>
              <div className="relative flex items-center justify-center">
                <svg width="96" height="96" className="-rotate-90">
                  <circle cx="48" cy="48" r={ringR} fill="none" stroke="rgba(195,192,255,0.15)" strokeWidth="4" />
                  <circle
                    cx="48" cy="48" r={ringR} fill="none" stroke="#c3c0ff" strokeWidth="4"
                    strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringOffset}
                    style={{ transition: "stroke-dashoffset 1s linear" }}
                  />
                </svg>
                <span className="absolute font-oswald font-black text-[#c3c0ff]" style={{ fontSize: "36px" }}>
                  {countdown}
                </span>
              </div>
            </div>
          )}

          {/* 촬영 시작 버튼 */}
          {step === "webcam_preview" && (
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

      /* ── 업로드 화면 ── */
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="max-w-lg mx-auto flex flex-col gap-6">
            <div className="glass-card px-5 py-4 flex items-start gap-3 text-base text-[#c7c4da]/60">
              <span className="material-symbols-outlined text-[#c3c0ff] shrink-0" style={{ fontSize: "24px" }}>info</span>
              <span>
                <strong className="text-[#c3c0ff]">전신이 보이는 정면·측면 사진</strong>을 각각
                1장씩 업로드해 주세요. 머리 끝부터 발 끝까지 다 보이는 사진이 가장 정확합니다.{" "}
                <strong className="text-amber-300">측면 촬영 시 오른쪽이 화면에 찍히도록 서세요.</strong>
              </span>
            </div>

            {errorMsg && (
              <div className="px-5 py-4 rounded-xl border border-[#ffb4ab]/30 text-base text-[#ffb4ab] bg-[#ffb4ab]/5">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-5">
              <UploadCard label="정면 사진" url={frontUrl} inputRef={frontInputRef} onChange={handleFrontChange} />
              <UploadCard label="측면 사진" url={sideUrl}  inputRef={sideInputRef}  onChange={handleSideChange} />
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!frontUrl || !sideUrl}
              className="w-full py-5 rounded-2xl text-base font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed text-[#050505] bg-[#c3c0ff] hover:bg-white shadow-[0_0_40px_rgba(195,192,255,0.3)]"
            >
              분석 시작
            </button>

            {/* 웹캠 대안 카드 */}
            <div className="glass-card px-5 py-5 flex flex-col items-center gap-4">
              <p className="text-sm text-[#c7c4da]/50">정면·측면 사진이 없다면?</p>
              <button
                onClick={handleStartWebcam}
                className="w-full py-4 rounded-2xl text-base font-bold text-[#c3c0ff] border border-[#c3c0ff]/30 hover:bg-[#c3c0ff]/10 transition-colors"
              >
                웹캠으로 실시간 분석하기
              </button>
              <p className="text-xs text-[#c7c4da]/30 text-center">
                웹캠 환경에 따라 정확도가 저하될 수 있습니다.
              </p>
            </div>
          </div>
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
