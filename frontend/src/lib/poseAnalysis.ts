export type Keypoint = {
  x: number;
  y: number;
  z?: number;
  score?: number;
  name?: string;
};

export type PostureIssue = {
  severity: "error" | "warning" | "good";
  message: string;
};

export type PoseAngles = Record<string, number>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function kp(keypoints: Keypoint[], name: string): Keypoint | undefined {
  return keypoints.find((k) => k.name === name);
}

function visible(k: Keypoint | undefined, t = 0.35): boolean {
  return !!k && (k.score ?? 0) > t;
}

function mid(a: Keypoint, b: Keypoint): Keypoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  };
}

function dist2d(a: Keypoint, b: Keypoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ── Core Analysis ─────────────────────────────────────────────────────────────

export function analyzePosture(keypoints: Keypoint[]): {
  angles: PoseAngles;
  score: number;
  issues: PostureIssue[];
  signature: number[];
} {
  const lEar      = kp(keypoints, "left_ear");
  const rEar      = kp(keypoints, "right_ear");
  const lShoulder = kp(keypoints, "left_shoulder");
  const rShoulder = kp(keypoints, "right_shoulder");
  const lHip      = kp(keypoints, "left_hip");
  const rHip      = kp(keypoints, "right_hip");
  const lAnkle    = kp(keypoints, "left_ankle");
  const rAnkle    = kp(keypoints, "right_ankle");

  const angles: PoseAngles = {};
  const issues: PostureIssue[] = [];
  let score = 100;

  // 어깨 너비를 기준 단위로 사용 (거리 스케일 독립)
  const refWidth =
    visible(lShoulder) && visible(rShoulder)
      ? dist2d(lShoulder!, rShoulder!)
      : 200;

  // ── 1. 거북목: 귀-어깨 수직 각도 ──────────────────────────────────────────
  // 귀 중앙이 어깨 중앙의 정수직 위에 있으면 0°. 앞으로 나올수록 각도 증가.
  if (visible(lEar) && visible(rEar) && visible(lShoulder) && visible(rShoulder)) {
    const earMid      = mid(lEar!, rEar!);
    const shoulderMid = mid(lShoulder!, rShoulder!);
    const dx = earMid.x - shoulderMid.x;
    const dy = shoulderMid.y - earMid.y; // 양수 = 귀가 어깨보다 위
    const tiltDeg = Math.atan2(Math.abs(dx), Math.max(dy, 1)) * (180 / Math.PI);
    angles.head_tilt_deg = tiltDeg;

    // z 깊이: 귀가 어깨보다 카메라 쪽(음수 방향)이면 거북목
    const earZ      = ((lEar!.z ?? 0) + (rEar!.z ?? 0)) / 2;
    const shoulderZ = ((lShoulder!.z ?? 0) + (rShoulder!.z ?? 0)) / 2;
    const zDiff = earZ - shoulderZ; // 음수 = 귀가 앞으로
    angles.head_forward_z = zDiff;

    if (tiltDeg > 22 || zDiff < -0.15) {
      issues.push({ severity: "error", message: "거북목이에요. 턱을 당기고 귀가 어깨 위에 오도록 자세를 바로잡으세요." });
      score -= 22;
    } else if (tiltDeg > 13 || zDiff < -0.08) {
      issues.push({ severity: "warning", message: "머리가 앞으로 약간 나와 있어요. 턱을 살짝 당겨보세요." });
      score -= 11;
    }
  }

  // ── 2. 어깨 말림: 어깨-귀 수평 차이 ──────────────────────────────────────
  // 어깨 끝이 귀보다 안쪽으로 들어올수록 말린 어깨.
  if (visible(lEar) && visible(lShoulder) && visible(rEar) && visible(rShoulder)) {
    const leftGap  = Math.abs(lShoulder!.x - lEar!.x) / refWidth;
    const rightGap = Math.abs(rShoulder!.x - rEar!.x) / refWidth;
    const avgGap   = (leftGap + rightGap) / 2;
    angles.shoulder_roll = avgGap * 100;

    if (avgGap > 0.28) {
      issues.push({ severity: "error", message: "어깨가 많이 말렸어요. 가슴을 펴고 어깨를 뒤로 당기세요." });
      score -= 20;
    } else if (avgGap > 0.16) {
      issues.push({ severity: "warning", message: "어깨가 약간 말려 있어요. 어깨를 뒤로 살짝 펴보세요." });
      score -= 10;
    }
  }

  // ── 3. 골반 기울기: 좌우 골반 높이 차 ────────────────────────────────────
  if (visible(lHip) && visible(rHip)) {
    const diff       = lHip!.y - rHip!.y; // 양수 = 왼쪽 골반이 낮음
    const normalized = Math.abs(diff) / refWidth;
    angles.hip_tilt = diff;

    if (normalized > 0.13) {
      const side = diff > 0 ? "왼쪽" : "오른쪽";
      issues.push({ severity: "error", message: `골반이 ${side}으로 많이 기울었어요. 체중을 균등하게 나눠보세요.` });
      score -= 18;
    } else if (normalized > 0.07) {
      const side = diff > 0 ? "왼쪽" : "오른쪽";
      issues.push({ severity: "warning", message: `골반이 ${side}으로 약간 기울었어요.` });
      score -= 9;
    }
  }

  // ── 4. 어깨 비대칭: 좌우 어깨 높이 차 ────────────────────────────────────
  if (visible(lShoulder) && visible(rShoulder)) {
    const diff       = lShoulder!.y - rShoulder!.y;
    const normalized = Math.abs(diff) / refWidth;
    angles.shoulder_asymmetry = diff;

    if (normalized > 0.13) {
      const side = diff > 0 ? "왼쪽" : "오른쪽";
      issues.push({ severity: "error", message: `어깨가 ${side}으로 많이 기울었어요.` });
      score -= 15;
    } else if (normalized > 0.07) {
      const side = diff > 0 ? "왼쪽" : "오른쪽";
      issues.push({ severity: "warning", message: `어깨가 ${side}으로 약간 기울었어요.` });
      score -= 8;
    }
  }

  // ── 5. 과신전: 어깨-골반-발목 일직선 여부 ────────────────────────────────
  // 좌우 중점 3개가 수직선 위에 얼마나 정렬되어 있는지 + z 깊이로 보완
  if (
    visible(lShoulder) && visible(rShoulder) &&
    visible(lHip)      && visible(rHip)      &&
    visible(lAnkle)    && visible(rAnkle)
  ) {
    const shoulderMid = mid(lShoulder!, rShoulder!);
    const hipMid      = mid(lHip!, rHip!);
    const ankleMid    = mid(lAnkle!, rAnkle!);

    // 측방 이탈: 어깨·골반 중앙이 발목 중앙과 얼마나 어긋나는지
    const shoulderDev = Math.abs(shoulderMid.x - ankleMid.x) / refWidth;
    const hipDev      = Math.abs(hipMid.x - ankleMid.x) / refWidth;
    const lateralDev  = Math.max(shoulderDev, hipDev);
    angles.lateral_deviation = lateralDev * 100;

    // z 기반: 골반이 어깨·발목 평균보다 앞으로 나오면 과신전
    const shoulderZ = ((lShoulder!.z ?? 0) + (rShoulder!.z ?? 0)) / 2;
    const hipZ      = ((lHip!.z ?? 0)      + (rHip!.z ?? 0))      / 2;
    const ankleZ    = ((lAnkle!.z ?? 0)    + (rAnkle!.z ?? 0))    / 2;
    const hipProtrusion = hipZ - (shoulderZ + ankleZ) / 2;
    angles.hip_protrusion_z = hipProtrusion;

    if (hipProtrusion > 0.13 || lateralDev > 0.22) {
      issues.push({ severity: "error", message: "척추가 과신전됐어요. 복부에 힘을 주고 중립 자세를 만드세요." });
      score -= 20;
    } else if (hipProtrusion > 0.07 || lateralDev > 0.13) {
      issues.push({ severity: "warning", message: "허리가 약간 과신전돼 있어요. 복부를 살짝 조여보세요." });
      score -= 10;
    }
  }

  if (issues.length === 0) {
    issues.push({ severity: "good", message: "자세가 좋아요! 지금 이 자세를 유지하세요." });
  }

  return {
    angles,
    score: Math.max(0, score),
    issues,
    signature: keypoints.map((k) => k.score ?? 0),
  };
}

// usePoseDetection에서 analyzeByExercise를 그대로 호출하므로 래퍼 유지
export function analyzeByExercise(
  _exercise: string,
  keypoints: Keypoint[]
): { angles: PoseAngles; score: number; issues: PostureIssue[]; signature: number[] } {
  return analyzePosture(keypoints);
}

// ── Skeleton Drawing ──────────────────────────────────────────────────────────

const CONNECTIONS: [string, string][] = [
  ["left_ear",      "left_shoulder"],
  ["right_ear",     "right_shoulder"],
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow",    "left_wrist"],
  ["right_shoulder","right_elbow"],
  ["right_elbow",   "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder","right_hip"],
  ["left_hip",      "right_hip"],
  ["left_hip",      "left_knee"],
  ["left_knee",     "left_ankle"],
  ["right_hip",     "right_knee"],
  ["right_knee",    "right_ankle"],
];

export function drawPoseSkeleton(
  ctx: CanvasRenderingContext2D,
  keypoints: Keypoint[],
  issues: PostureIssue[],
  _width: number,
  _height: number
): void {
  const hasError   = issues.some((i) => i.severity === "error");
  const hasWarning = issues.some((i) => i.severity === "warning");
  const color = hasError ? "#ef4444" : hasWarning ? "#f59e0b" : "#4ade80";

  const kpMap = new Map(keypoints.map((k) => [k.name ?? "", k]));

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  for (const [a, b] of CONNECTIONS) {
    const ka = kpMap.get(a);
    const kb = kpMap.get(b);
    if (ka && kb && (ka.score ?? 0) > 0.35 && (kb.score ?? 0) > 0.35) {
      ctx.beginPath();
      ctx.moveTo(ka.x, ka.y);
      ctx.lineTo(kb.x, kb.y);
      ctx.stroke();
    }
  }

  ctx.fillStyle = color;
  ctx.globalAlpha = 1;
  for (const k of keypoints) {
    if ((k.score ?? 0) > 0.35) {
      ctx.beginPath();
      ctx.arc(k.x, k.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
