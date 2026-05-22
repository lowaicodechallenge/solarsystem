export const USER_ID =
  typeof window !== "undefined"
    ? (() => {
        const saved = localStorage.getItem("fitai_user_id");
        if (saved) return saved;
        localStorage.removeItem("fitai_symptoms");
        localStorage.removeItem("fitai_posture_analysis");
        localStorage.removeItem("fitai_last_document");
        localStorage.removeItem("fitai_health_documents");
        const newId = `user_${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem("fitai_user_id", newId);
        return newId;
      })()
    : "user_default";

export const EXERCISES = [
  { id: "squat", name: "스쿼트", emoji: "🦵" },
  { id: "pushup", name: "푸시업", emoji: "💪" },
  { id: "plank", name: "플랭크", emoji: "🏋️" },
  { id: "stretch", name: "스트레칭", emoji: "🧘" },
  { id: "posture_scan", name: "자세 분석", emoji: "🧍" },
  { id: "nfa_video", name: "추천 운동 영상", emoji: "▶️" },
];

export function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

export function getScoreLabel(score: number): string {
  if (score >= 90) return "훌륭해요";
  if (score >= 80) return "잘하고 있어요";
  if (score >= 70) return "양호";
  if (score >= 60) return "개선 필요";
  return "자세를 교정하세요";
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
