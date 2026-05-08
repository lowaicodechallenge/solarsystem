"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { getScoreColor, getScoreLabel, formatDuration } from "@/lib/utils";
import { api } from "@/lib/api";

import type { Keypoint } from "@tensorflow-models/pose-detection";

type Props = {
  exercise: string;
  userId: string;
  onAnalysis?: (data: { score: number; issues: string[]; signature: number[]; keypoints: Keypoint[] }) => void;
  battleMode?: boolean;
};

export default function PoseDetector({ exercise, userId, onAnalysis, battleMode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const analyzeThrottle = useRef(0);

  const pose = usePoseDetection(videoRef, canvasRef, exercise, active);

  // Collect scores for average
  useEffect(() => {
    if (active && pose.isDetecting && pose.score > 0) {
      setScores((prev) => [...prev.slice(-60), pose.score]);
    }
  }, [pose.score, pose.isDetecting, active]);

  // Throttled LLM analysis every 15s
  useEffect(() => {
    if (!active || !pose.isDetecting) return;
    const now = Date.now();
    if (now - analyzeThrottle.current < 15000) return;
    analyzeThrottle.current = now;

    api
      .analyzePose({
        user_id: userId,
        exercise_type: exercise,
        keypoints: {},
        angles: pose.angles,
        score: pose.score,
      })
      .then(() => {
        if (onAnalysis) {
          onAnalysis({
            score: pose.score,
            issues: pose.issues.map((i) => i.message),
            signature: pose.signature,
            keypoints: pose.keypoints,
          });
        }
      })
      .catch(() => {});
  }, [pose, active, exercise, userId, onAnalysis]);

  // Timer
  useEffect(() => {
    if (active) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active]);

  const startWorkout = useCallback(async () => {
    setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setElapsed(0);
      setScores([]);
      setActive(true);
    } catch {
      alert("웹캠 접근 권한이 필요합니다.");
    }
    setLoading(false);
  }, []);

  const stopWorkout = useCallback(async () => {
    setActive(false);
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;

    if (scores.length > 0 && elapsed > 5) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const params = new URLSearchParams({
        user_id: userId,
        exercise_type: exercise,
        duration: elapsed.toString(),
        avg_score: avg.toString(),
      });
      await api.savePoseSession(params).catch(() => {});
    }
  }, [scores, elapsed, userId, exercise]);

  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const scoreColor = getScoreColor(pose.score);
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (pose.score / 100) * circumference;

  const topIssue = pose.issues.find((i) => i.severity === "error" || i.severity === "warning");
  const goodMsg = pose.issues.find((i) => i.severity === "good");

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Video + Canvas */}
      <div className="relative bg-dark-700 rounded-2xl overflow-hidden aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full object-cover scale-x-[-1]"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="pose-canvas scale-x-[-1]"
        />

        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60">
            <div className="text-5xl">
              {exercise === "squat" ? "🦵" : exercise === "pushup" ? "💪" : "🏋️"}
            </div>
            <p className="text-white font-semibold text-lg">
              {exercise === "squat" ? "스쿼트" : exercise === "pushup" ? "푸시업" : "플랭크"} 자세 분석
            </p>
            <button
              onClick={startWorkout}
              disabled={loading}
              className="px-8 py-3 bg-primary-500 hover:bg-primary-600 text-black font-bold rounded-xl transition-all glow-green disabled:opacity-50"
            >
              {loading ? "카메라 준비 중..." : "운동 시작"}
            </button>
          </div>
        )}

        {/* Overlay HUD */}
        {active && (
          <div className="absolute top-3 left-3 right-3 flex justify-between items-start pointer-events-none">
            <div className="glass-card rounded-lg px-3 py-1.5 text-sm">
              <span className="text-gray-400">시간 </span>
              <span className="text-white font-mono font-bold">{formatDuration(elapsed)}</span>
            </div>
            <div className="glass-card rounded-lg px-3 py-1.5 text-sm">
              <span className="text-gray-400">평균 </span>
              <span className="font-bold" style={{ color: getScoreColor(avgScore) }}>
                {avgScore.toFixed(0)}점
              </span>
            </div>
          </div>
        )}

        {/* Real-time correction banner */}
        {active && topIssue && (
          <div
            className={`absolute bottom-14 left-3 right-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-center transition-all
              ${topIssue.severity === "error" ? "bg-red-500/90" : "bg-amber-500/90"}`}
          >
            {topIssue.message}
          </div>
        )}
        {active && !topIssue && goodMsg && (
          <div className="absolute bottom-14 left-3 right-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-center bg-primary-500/90">
            {goodMsg.message}
          </div>
        )}

        {active && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center">
            <button
              onClick={stopWorkout}
              className="px-6 py-2 bg-red-500/90 hover:bg-red-600 text-white font-bold rounded-xl text-sm transition-all"
            >
              운동 종료
            </button>
          </div>
        )}
      </div>

      {/* Score Ring + Details */}
      {active && (
        <div className="glass-card rounded-2xl p-4 flex items-center gap-6">
          {/* SVG Score Ring */}
          <div className="relative flex-shrink-0">
            <svg width="100" height="100" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#222" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={scoreColor}
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.4s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold" style={{ color: scoreColor }}>
                {pose.score.toFixed(0)}
              </span>
              <span className="text-xs text-gray-400">{getScoreLabel(pose.score)}</span>
            </div>
          </div>

          {/* Issues list */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">실시간 피드백</h4>
            <div className="space-y-1">
              {pose.issues.slice(0, 3).map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 flex-shrink-0">
                    {issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🟢"}
                  </span>
                  <span className={
                    issue.severity === "error" ? "text-red-400" :
                    issue.severity === "warning" ? "text-amber-400" : "text-primary-400"
                  }>
                    {issue.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
