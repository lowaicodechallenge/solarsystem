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

// B를 꼭짓점으로 하는 A-B-C 내각 (도 단위, 0°~180°)
function calcAngleDeg(A: Keypoint, B: Keypoint, C: Keypoint): number {
  const v1 = { x: A.x - B.x, y: A.y - B.y };
  const v2 = { x: C.x - B.x, y: C.y - B.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.sqrt(v1.x ** 2 + v1.y ** 2) * Math.sqrt(v2.x ** 2 + v2.y ** 2);
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

// origin 기준 OA × OB 의 z 성분 (2D 외적)
function cross2D(origin: Keypoint, A: Keypoint, B: Keypoint): number {
  return (A.x - origin.x) * (B.y - origin.y) - (A.y - origin.y) * (B.x - origin.x);
}

// ── Core Analysis ─────────────────────────────────────────────────────────────
//
// 측면 촬영 기준: 사용자의 오른쪽이 카메라에 찍히도록 서야 함.
// 무릎 과신전(#8)·골반 경사(#7)의 cross 부호가 이 방향으로 고정됨.

export function analyzePosture(keypoints: Keypoint[], isSideView = false): {
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
  const lKnee     = kp(keypoints, "left_knee");
  const rKnee     = kp(keypoints, "right_knee");
  const lAnkle    = kp(keypoints, "left_ankle");
  const rAnkle    = kp(keypoints, "right_ankle");

  const angles: PoseAngles = {};
  const issues: PostureIssue[] = [];
  let score = 100;

  const refWidth =
    visible(lShoulder) && visible(rShoulder)
      ? dist2d(lShoulder!, rShoulder!)
      : 200;

  // ── 1. 거북목 (공통) ──────────────────────────────────────────────────────
  // AND 조건으로 z 노이즈에 의한 위양성 방지. 최대 -20점.
  if (visible(lEar) && visible(rEar) && visible(lShoulder) && visible(rShoulder)) {
    const earMid      = mid(lEar!, rEar!);
    const shoulderMid = mid(lShoulder!, rShoulder!);
    const dx = Math.abs(earMid.x - shoulderMid.x);
    const dy = Math.abs(shoulderMid.y - earMid.y);
    const tiltDeg = Math.atan2(dx, Math.max(dy, 1)) * (180 / Math.PI);
    const zDiff = (earMid.z ?? 0) - (shoulderMid.z ?? 0); // 음수 = 귀가 앞으로
    angles.head_tilt_deg  = tiltDeg;
    angles.head_forward_z = zDiff;

    let deduction = 0;
    let severity: "warning" | "error" = "warning";
    let message = "";
    if (tiltDeg > 13 && zDiff < -0.08) {
      deduction += 5; severity = "warning";
      message = "머리가 앞으로 약간 나와 있어요. 턱을 살짝 당겨보세요.";
    }
    if (tiltDeg > 22 && zDiff < -0.15) {
      deduction += 8; severity = "error";
      message = "거북목이에요. 턱을 당기고 귀가 어깨 위에 오도록 자세를 바로잡으세요.";
    }
    if (tiltDeg > 35 && zDiff < -0.25) {
      deduction += 7; severity = "error";
      message = "거북목이 심각해요. 즉시 자세를 교정해 주세요.";
    }
    if (deduction > 0) {
      issues.push({ severity, message });
      score -= deduction;
    }
  }

  // ── 2. 머리 기울기 — 정면 전용 ────────────────────────────────────────────
  if (!isSideView && visible(lEar) && visible(rEar) && visible(lShoulder) && visible(rShoulder)) {
    const normalized = Math.abs(lEar!.y - rEar!.y) / refWidth;
    angles.head_lateral_tilt = normalized;
    if (normalized > 0.13) {
      const side = lEar!.y > rEar!.y ? "왼쪽" : "오른쪽";
      issues.push({ severity: "error", message: `머리가 ${side}으로 많이 기울었어요. 머리를 바르게 세워보세요.` });
      score -= 7;
    } else if (normalized > 0.07) {
      const side = lEar!.y > rEar!.y ? "왼쪽" : "오른쪽";
      issues.push({ severity: "warning", message: `머리가 ${side}으로 약간 기울었어요.` });
      score -= 3;
    }
  }

  // ── 3. 어깨 말림 — 측면 전용 ──────────────────────────────────────────────
  if (isSideView && visible(lEar) && visible(rEar) && visible(lShoulder) && visible(rShoulder)) {
    const shoulderMid = mid(lShoulder!, rShoulder!);
    const earMid      = mid(lEar!, rEar!);
    const zDiff    = (shoulderMid.z ?? 0) - (earMid.z ?? 0);
    const leftGap  = Math.abs(lShoulder!.x - lEar!.x) / refWidth;
    const rightGap = Math.abs(rShoulder!.x - rEar!.x) / refWidth;
    const avgGap   = (leftGap + rightGap) / 2;
    angles.shoulder_roll   = avgGap * 100;
    angles.shoulder_z_diff = zDiff;
    if (zDiff < -0.20 && avgGap > 0.28) {
      issues.push({ severity: "error", message: "어깨가 많이 말렸어요. 가슴을 펴고 어깨를 뒤로 당기세요." });
      score -= 10;
    } else if (zDiff < -0.12 && avgGap > 0.16) {
      issues.push({ severity: "warning", message: "어깨가 약간 말려 있어요. 어깨를 뒤로 살짝 펴보세요." });
      score -= 5;
    }
  }

  // ── 4. 어깨 비대칭 — 정면 전용 ────────────────────────────────────────────
  if (!isSideView && visible(lShoulder) && visible(rShoulder)) {
    const diff       = lShoulder!.y - rShoulder!.y;
    const normalized = Math.abs(diff) / refWidth;
    angles.shoulder_asymmetry = diff;
    if (normalized > 0.13) {
      const side = diff > 0 ? "왼쪽" : "오른쪽";
      issues.push({ severity: "error", message: `어깨가 ${side}으로 많이 기울었어요.` });
      score -= 7;
    } else if (normalized > 0.07) {
      const side = diff > 0 ? "왼쪽" : "오른쪽";
      issues.push({ severity: "warning", message: `어깨가 ${side}으로 약간 기울었어요.` });
      score -= 3;
    }
  }

  // ── 5. 골반 기울기 — 정면 전용 ────────────────────────────────────────────
  if (!isSideView && visible(lHip) && visible(rHip)) {
    const diff       = lHip!.y - rHip!.y;
    const normalized = Math.abs(diff) / refWidth;
    angles.hip_tilt = diff;
    if (normalized > 0.13) {
      const side = diff > 0 ? "왼쪽" : "오른쪽";
      issues.push({ severity: "error", message: `골반이 ${side}으로 많이 기울었어요. 체중을 균등하게 나눠보세요.` });
      score -= 10;
    } else if (normalized > 0.07) {
      const side = diff > 0 ? "왼쪽" : "오른쪽";
      issues.push({ severity: "warning", message: `골반이 ${side}으로 약간 기울었어요.` });
      score -= 5;
    }
  }

  // ── 6. 골반 전방 변위 — 측면 전용 ────────────────────────────────────────
  if (
    isSideView &&
    visible(lShoulder) && visible(rShoulder) &&
    visible(lHip)      && visible(rHip)      &&
    visible(lAnkle)    && visible(rAnkle)
  ) {
    const shoulderMid   = mid(lShoulder!, rShoulder!);
    const hipMid        = mid(lHip!, rHip!);
    const ankleMid      = mid(lAnkle!, rAnkle!);
    const hipProtrusion = (hipMid.z ?? 0) - ((shoulderMid.z ?? 0) + (ankleMid.z ?? 0)) / 2;
    angles.hip_protrusion_z = hipProtrusion;
    if (hipProtrusion > 0.13) {
      issues.push({ severity: "error", message: "척추가 과신전됐어요. 복부에 힘을 주고 중립 자세를 만드세요." });
      score -= 13;
    } else if (hipProtrusion > 0.07) {
      issues.push({ severity: "warning", message: "허리가 약간 과신전돼 있어요. 복부를 살짝 조여보세요." });
      score -= 7;
    }
  }

  // ── 7. 골반 경사 — 측면 전용 ──────────────────────────────────────────────
  // 오른쪽 측면 촬영 기준: crossVal > 0 → 전방경사, crossVal < 0 → 후방경사
  if (
    isSideView &&
    visible(lShoulder) && visible(rShoulder) &&
    visible(lHip)      && visible(rHip)      &&
    visible(lKnee)     && visible(rKnee)
  ) {
    const shoulderMid     = mid(lShoulder!, rShoulder!);
    const hipMid          = mid(lHip!, rHip!);
    const kneeMid         = mid(lKnee!, rKnee!);
    const pelvicTiltAngle = calcAngleDeg(shoulderMid, hipMid, kneeMid);
    const crossVal        = cross2D(shoulderMid, hipMid, kneeMid);
    angles.pelvic_tilt_angle = pelvicTiltAngle;
    angles.pelvic_tilt_cross = crossVal;
    if (crossVal > 0 && pelvicTiltAngle < 160) {
      issues.push({ severity: "error", message: "골반이 앞으로 많이 기울었어요. 복부에 힘을 주고 골반을 중립으로 맞추세요." });
      score -= 7;
    } else if (crossVal > 0 && pelvicTiltAngle < 170) {
      issues.push({ severity: "warning", message: "골반이 약간 앞으로 기울어 있어요. 허리를 살짝 세워보세요." });
      score -= 3;
    } else if (crossVal < 0 && pelvicTiltAngle < 160) {
      issues.push({ severity: "error", message: "골반이 뒤로 많이 기울었어요. 허리를 곧게 세우고 골반을 중립으로 맞추세요." });
      score -= 7;
    } else if (crossVal < 0 && pelvicTiltAngle < 170) {
      issues.push({ severity: "warning", message: "골반이 약간 뒤로 기울어 있어요. 허리를 살짝 세워보세요." });
      score -= 3;
    }
  }

  // ── 8. 무릎 과신전 — 측면 전용 ────────────────────────────────────────────
  // 오른쪽 측면 촬영 기준: crossKnee < 0 → 무릎이 뒤로 꺾인 것 (과신전)
  if (
    isSideView &&
    visible(lHip)   && visible(rHip)   &&
    visible(lKnee)  && visible(rKnee)  &&
    visible(lAnkle) && visible(rAnkle)
  ) {
    const hipMid    = mid(lHip!, rHip!);
    const kneeMid   = mid(lKnee!, rKnee!);
    const ankleMid  = mid(lAnkle!, rAnkle!);
    const kneeAngle = calcAngleDeg(hipMid, kneeMid, ankleMid);
    const crossKnee = cross2D(hipMid, kneeMid, ankleMid);
    angles.knee_angle = kneeAngle;
    angles.knee_cross = crossKnee;
    if (crossKnee < 0 && kneeAngle > 180) {
      issues.push({ severity: "error", message: "무릎이 뒤로 심하게 꺾여 있어요. 무릎을 살짝 굽혀 과신전을 완화해 보세요." });
      score -= 7;
    } else if (crossKnee < 0 && kneeAngle > 175) {
      issues.push({ severity: "warning", message: "무릎이 약간 과신전돼 있어요. 무릎을 살짝 이완해 보세요." });
      score -= 3;
    }
  }

  // ── 9. 몸통 측방 이탈 — 정면 전용 ────────────────────────────────────────
  if (
    !isSideView &&
    visible(lShoulder) && visible(rShoulder) &&
    visible(lHip)      && visible(rHip)      &&
    visible(lAnkle)    && visible(rAnkle)
  ) {
    const shoulderMid = mid(lShoulder!, rShoulder!);
    const hipMid      = mid(lHip!, rHip!);
    const ankleMid    = mid(lAnkle!, rAnkle!);
    const lateralDev  = Math.max(
      Math.abs(shoulderMid.x - ankleMid.x),
      Math.abs(hipMid.x - ankleMid.x)
    ) / refWidth;
    angles.lateral_deviation = lateralDev * 100;
    if (lateralDev > 0.22) {
      issues.push({ severity: "error", message: "몸통이 한쪽으로 많이 기울었어요. 체중을 양발에 균등하게 분산해 보세요." });
      score -= 7;
    } else if (lateralDev > 0.13) {
      issues.push({ severity: "warning", message: "몸통이 약간 측방으로 이탈했어요. 자세를 중립으로 맞춰보세요." });
      score -= 3;
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
  keypoints: Keypoint[],
  isSideView = false
): { angles: PoseAngles; score: number; issues: PostureIssue[]; signature: number[] } {
  return analyzePosture(keypoints, isSideView);
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
