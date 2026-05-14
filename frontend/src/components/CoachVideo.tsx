"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { getScoreColor } from "@/lib/utils";
import type { Keypoint } from "@/lib/poseAnalysis";

// Normalized skeleton keyframe positions [x, y] in 0..1 space
// Each keyframe is one snapshot of the coach's pose
type SkeletonFrame = Record<string, [number, number]>;

// ─── SQUAT keyframes ──────────────────────────────────────────────────────────
const SQUAT_FRAMES: SkeletonFrame[] = [
  // 0: standing upright
  {
    nose: [0.5, 0.08], left_eye: [0.52, 0.06], right_eye: [0.48, 0.06],
    left_shoulder: [0.60, 0.22], right_shoulder: [0.40, 0.22],
    left_elbow: [0.65, 0.38], right_elbow: [0.35, 0.38],
    left_wrist: [0.63, 0.52], right_wrist: [0.37, 0.52],
    left_hip: [0.57, 0.50], right_hip: [0.43, 0.50],
    left_knee: [0.57, 0.72], right_knee: [0.43, 0.72],
    left_ankle: [0.57, 0.92], right_ankle: [0.43, 0.92],
  },
  // 1: beginning descent
  {
    nose: [0.5, 0.12], left_eye: [0.52, 0.10], right_eye: [0.48, 0.10],
    left_shoulder: [0.60, 0.26], right_shoulder: [0.40, 0.26],
    left_elbow: [0.66, 0.40], right_elbow: [0.34, 0.40],
    left_wrist: [0.64, 0.52], right_wrist: [0.36, 0.52],
    left_hip: [0.58, 0.54], right_hip: [0.42, 0.54],
    left_knee: [0.60, 0.74], right_knee: [0.40, 0.74],
    left_ankle: [0.58, 0.93], right_ankle: [0.42, 0.93],
  },
  // 2: parallel (90°)
  {
    nose: [0.5, 0.20], left_eye: [0.52, 0.18], right_eye: [0.48, 0.18],
    left_shoulder: [0.61, 0.33], right_shoulder: [0.39, 0.33],
    left_elbow: [0.68, 0.44], right_elbow: [0.32, 0.44],
    left_wrist: [0.66, 0.54], right_wrist: [0.34, 0.54],
    left_hip: [0.60, 0.60], right_hip: [0.40, 0.60],
    left_knee: [0.62, 0.76], right_knee: [0.38, 0.76],
    left_ankle: [0.59, 0.92], right_ankle: [0.41, 0.92],
  },
  // 3: deep squat (hold)
  {
    nose: [0.5, 0.26], left_eye: [0.52, 0.24], right_eye: [0.48, 0.24],
    left_shoulder: [0.61, 0.38], right_shoulder: [0.39, 0.38],
    left_elbow: [0.68, 0.48], right_elbow: [0.32, 0.48],
    left_wrist: [0.66, 0.56], right_wrist: [0.34, 0.56],
    left_hip: [0.61, 0.64], right_hip: [0.39, 0.64],
    left_knee: [0.63, 0.78], right_knee: [0.37, 0.78],
    left_ankle: [0.60, 0.93], right_ankle: [0.40, 0.93],
  },
  // 4: rising back
  {
    nose: [0.5, 0.20], left_eye: [0.52, 0.18], right_eye: [0.48, 0.18],
    left_shoulder: [0.61, 0.33], right_shoulder: [0.39, 0.33],
    left_elbow: [0.68, 0.44], right_elbow: [0.32, 0.44],
    left_wrist: [0.66, 0.54], right_wrist: [0.34, 0.54],
    left_hip: [0.60, 0.60], right_hip: [0.40, 0.60],
    left_knee: [0.62, 0.76], right_knee: [0.38, 0.76],
    left_ankle: [0.59, 0.92], right_ankle: [0.41, 0.92],
  },
];
const SQUAT_TIMING = [0, 0.15, 0.35, 0.50, 0.70]; // normalized time 0..1

// ─── PUSHUP keyframes ─────────────────────────────────────────────────────────
const PUSHUP_FRAMES: SkeletonFrame[] = [
  // top (arms extended) - shown from side perspective
  {
    nose: [0.12, 0.28], left_eye: [0.10, 0.26], right_eye: [0.14, 0.26],
    left_shoulder: [0.25, 0.35], right_shoulder: [0.25, 0.35],
    left_elbow: [0.40, 0.35], right_elbow: [0.40, 0.35],
    left_wrist: [0.55, 0.35], right_wrist: [0.55, 0.35],
    left_hip: [0.60, 0.40], right_hip: [0.60, 0.40],
    left_knee: [0.75, 0.42], right_knee: [0.75, 0.42],
    left_ankle: [0.90, 0.44], right_ankle: [0.90, 0.44],
  },
  // mid-descent
  {
    nose: [0.12, 0.38], left_eye: [0.10, 0.36], right_eye: [0.14, 0.36],
    left_shoulder: [0.25, 0.45], right_shoulder: [0.25, 0.45],
    left_elbow: [0.38, 0.50], right_elbow: [0.38, 0.50],
    left_wrist: [0.52, 0.52], right_wrist: [0.52, 0.52],
    left_hip: [0.60, 0.48], right_hip: [0.60, 0.48],
    left_knee: [0.75, 0.48], right_knee: [0.75, 0.48],
    left_ankle: [0.90, 0.50], right_ankle: [0.90, 0.50],
  },
  // bottom (chest near floor)
  {
    nose: [0.12, 0.52], left_eye: [0.10, 0.50], right_eye: [0.14, 0.50],
    left_shoulder: [0.25, 0.58], right_shoulder: [0.25, 0.58],
    left_elbow: [0.35, 0.66], right_elbow: [0.35, 0.66],
    left_wrist: [0.50, 0.68], right_wrist: [0.50, 0.68],
    left_hip: [0.60, 0.58], right_hip: [0.60, 0.58],
    left_knee: [0.75, 0.56], right_knee: [0.75, 0.56],
    left_ankle: [0.90, 0.56], right_ankle: [0.90, 0.56],
  },
  // rising
  {
    nose: [0.12, 0.38], left_eye: [0.10, 0.36], right_eye: [0.14, 0.36],
    left_shoulder: [0.25, 0.45], right_shoulder: [0.25, 0.45],
    left_elbow: [0.38, 0.50], right_elbow: [0.38, 0.50],
    left_wrist: [0.52, 0.52], right_wrist: [0.52, 0.52],
    left_hip: [0.60, 0.48], right_hip: [0.60, 0.48],
    left_knee: [0.75, 0.48], right_knee: [0.75, 0.48],
    left_ankle: [0.90, 0.50], right_ankle: [0.90, 0.50],
  },
];
const PUSHUP_TIMING = [0, 0.25, 0.50, 0.80];

// ─── PLANK keyframes ──────────────────────────────────────────────────────────
const PLANK_FRAMES: SkeletonFrame[] = [
  {
    nose: [0.10, 0.38], left_eye: [0.08, 0.36], right_eye: [0.12, 0.36],
    left_shoulder: [0.25, 0.46], right_shoulder: [0.25, 0.46],
    left_elbow: [0.30, 0.58], right_elbow: [0.30, 0.58],
    left_wrist: [0.35, 0.62], right_wrist: [0.35, 0.62],
    left_hip: [0.60, 0.48], right_hip: [0.60, 0.48],
    left_knee: [0.75, 0.50], right_knee: [0.75, 0.50],
    left_ankle: [0.88, 0.52], right_ankle: [0.88, 0.52],
  },
];

const EXERCISE_CONFIG: Record<string, { frames: SkeletonFrame[]; timing: number[]; duration: number; cues: string[] }> = {
  squat: {
    frames: SQUAT_FRAMES,
    timing: SQUAT_TIMING,
    duration: 3500,
    cues: ["천천히 내려가세요", "무릎이 발끝을 따라가게!", "깊게 앉아 주세요", "힘을 모아 올라오세요"],
  },
  pushup: {
    frames: PUSHUP_FRAMES,
    timing: PUSHUP_TIMING,
    duration: 3000,
    cues: ["팔을 천천히 구부려요", "가슴이 바닥에 가깝게!", "폭발적으로 올라오세요"],
  },
  plank: {
    frames: PLANK_FRAMES,
    timing: [0],
    duration: 60000,
    cues: ["복근에 힘주세요!", "엉덩이가 처지지 않게!", "호흡을 유지하세요"],
  },
};

const CONNECTIONS: [string, string][] = [
  ["nose", "left_shoulder"], ["nose", "right_shoulder"],
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function interpolateFrame(frames: SkeletonFrame[], timing: number[], t: number): SkeletonFrame {
  // Find which two frames we're between
  let segStart = 0, segEnd = frames.length - 1;
  for (let i = 0; i < timing.length - 1; i++) {
    if (t >= timing[i] && t <= timing[i + 1]) {
      segStart = i;
      segEnd = i + 1;
      break;
    }
  }
  if (frames.length === 1) return frames[0];
  const segT = timing[segEnd] === timing[segStart] ? 0 :
    (t - timing[segStart]) / (timing[segEnd] - timing[segStart]);
  const smooth = segT < 0.5 ? 2 * segT * segT : -1 + (4 - 2 * segT) * segT; // ease

  const a = frames[segStart];
  const b = frames[segEnd];
  const result: SkeletonFrame = {};
  for (const key of Object.keys(a)) {
    result[key] = [
      lerp(a[key][0], b[key][0], smooth),
      lerp(a[key][1], b[key][1], smooth),
    ];
  }
  return result;
}

function drawCoach(
  ctx: CanvasRenderingContext2D,
  frame: SkeletonFrame,
  w: number,
  h: number,
  similarity: number
) {
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = "#0d1f12";
  ctx.fillRect(0, 0, w, h);

  // Grid lines subtle
  ctx.strokeStyle = "rgba(34,197,94,0.06)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  const pts = new Map<string, { x: number; y: number }>();
  for (const [name, [nx, ny]] of Object.entries(frame)) {
    pts.set(name, { x: nx * w, y: ny * h });
  }

  // Draw connections
  const glowColor = `rgba(34,197,94,${0.4 + similarity * 0.5})`;
  ctx.shadowBlur = 12;
  ctx.shadowColor = glowColor;
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  for (const [a, b] of CONNECTIONS) {
    const pa = pts.get(a);
    const pb = pts.get(b);
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  // Draw joints
  ctx.shadowBlur = 16;
  for (const pt of pts.values()) {
    ctx.fillStyle = `rgba(134,239,172,${0.7 + similarity * 0.3})`;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Coach label
  ctx.fillStyle = "rgba(34,197,94,0.9)";
  ctx.font = "bold 13px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("AI 코치", w / 2, 18);
}

function computeSimilarity(
  coachFrame: SkeletonFrame,
  userKps: Keypoint[],
  canvasW: number,
  canvasH: number
): number {
  if (!userKps.length) return 0;
  const userMap = new Map(userKps.map((kp) => [kp.name!, { x: kp.x / canvasW, y: kp.y / canvasH }]));

  let total = 0, count = 0;
  for (const [name, [cx, cy]] of Object.entries(coachFrame)) {
    const u = userMap.get(name);
    if (!u) continue;
    const dist = Math.sqrt((cx - u.x) ** 2 + (cy - u.y) ** 2);
    total += Math.max(0, 1 - dist * 4);
    count++;
  }
  return count > 0 ? total / count : 0;
}

type Props = {
  exercise: string;
  userKeypoints?: Keypoint[];
  userCanvasSize?: { w: number; h: number };
  onSimilarity?: (score: number) => void;
};

export default function CoachVideo({ exercise, userKeypoints = [], userCanvasSize, onSimilarity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const [cueIndex, setCueIndex] = useState(0);
  const [similarity, setSimilarity] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const prevPhaseRef = useRef(0);
  const config = EXERCISE_CONFIG[exercise] ?? EXERCISE_CONFIG.squat;

  const animate = useCallback(
    (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const t = (elapsed % config.duration) / config.duration; // 0..1 loop

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const frame = interpolateFrame(config.frames, config.timing, t);

      // Compute user similarity
      const sim = computeSimilarity(
        frame,
        userKeypoints,
        userCanvasSize?.w ?? 640,
        userCanvasSize?.h ?? 480
      );
      setSimilarity(sim);
      onSimilarity?.(sim);

      drawCoach(ctx, frame, canvas.width, canvas.height, sim);

      // Rep counting (when returning to phase 0 after mid)
      const phase = Math.floor(t * config.frames.length);
      if (phase === 0 && prevPhaseRef.current >= config.frames.length - 1) {
        setRepCount((r) => r + 1);
      }
      prevPhaseRef.current = phase;

      // Cycle cues
      const cueI = Math.floor(t * config.cues.length);
      setCueIndex(cueI);

      animRef.current = requestAnimationFrame(animate);
    },
    [config, userKeypoints, userCanvasSize, onSimilarity]
  );

  useEffect(() => {
    startTimeRef.current = 0;
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [animate]);

  const simColor = getScoreColor(similarity * 100);
  const matchPercent = Math.round(similarity * 100);

  return (
    <div className="flex flex-col gap-2">
      {/* Coach canvas */}
      <div className="relative bg-[#0d1f12] rounded-2xl overflow-hidden aspect-video">
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="w-full h-full"
        />

        {/* Match badge */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 glass-card rounded-lg px-2.5 py-1.5">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: simColor }} />
          <span className="text-xs font-bold" style={{ color: simColor }}>
            {matchPercent}% 일치
          </span>
        </div>

        {/* Cue banner */}
        <div className="absolute bottom-10 left-3 right-3 text-center">
          <span className="px-4 py-2 bg-primary-500/90 text-black font-bold text-sm rounded-xl">
            {config.cues[cueIndex] ?? config.cues[0]}
          </span>
        </div>

        {/* Rep count */}
        {exercise !== "plank" && (
          <div className="absolute bottom-2 left-3">
            <span className="text-xs text-primary-400 font-mono font-bold">
              {repCount}회 완료
            </span>
          </div>
        )}
      </div>

      {/* Similarity bar */}
      <div className="glass-card rounded-xl px-4 py-2.5 flex items-center gap-3">
        <span className="text-xs text-gray-400 w-16 flex-shrink-0">코치 일치율</span>
        <div className="flex-1 h-2 bg-dark-500 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${matchPercent}%`, background: simColor }}
          />
        </div>
        <span className="text-xs font-bold w-8 text-right" style={{ color: simColor }}>
          {matchPercent}
        </span>
      </div>
    </div>
  );
}
