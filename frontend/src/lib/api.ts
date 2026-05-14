const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  getPoseHistory: (userId: string) =>
    fetchJson(`/api/pose/history/${encodeURIComponent(userId)}`),

  getUpcoming: (userId: string) =>
    fetchJson(`/api/calendar/upcoming/${encodeURIComponent(userId)}`),

  updateSymptoms: (userId: string, symptoms: string) =>
    fetchJson(
      `/api/workout/user/symptoms?user_id=${encodeURIComponent(userId)}&symptoms=${encodeURIComponent(symptoms)}`,
      { method: "PUT" }
    ),

  analyzePose: (data: {
    user_id: string;
    exercise_type: string;
    keypoints: Record<string, unknown>;
    angles: Record<string, number>;
    score: number;
    session_id?: string;
  }) =>
    fetchJson("/api/pose/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  savePoseSession: (params: URLSearchParams) =>
    fetchJson(`/api/pose/session/save?${params.toString()}`, {
      method: "POST",
    }),

  sendChat: (data: {
    user_id: string;
    message: string;
    pose_context: Record<string, unknown>;
  }) =>
    fetchJson("/api/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  joinBattle: (data: {
    user_id: string;
    exercise_type: string;
    pose_signature: number[];
  }) =>
    fetchJson("/api/battle/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  endBattle: (battleId: string) =>
    fetchJson(`/api/battle/end/${encodeURIComponent(battleId)}`, {
      method: "POST",
    }),

  leaveBattle: (userId: string) =>
    fetchJson(`/api/battle/leave/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),

  getRoutine: (data: {
    user_id: string;
    pose_summary: string;
    posture_issues: string[];
  }) =>
    fetchJson("/api/workout/routine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  recommendExercises: (data: {
    user_id: string;
    posture_issues: string[];
    front_score: number;
    side_score: number;
    symptoms: string;
    doc_text: string;
  }) =>
    fetchJson("/api/workout/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  searchVideos: (query: string, maxResults = 4) =>
    fetchJson<{ videos: unknown[]; search_url: string | null }>(
      `/api/workout/videos?query=${encodeURIComponent(query)}&max_results=${maxResults}`
    ),

  ocrDocument: async (file: File): Promise<{ text: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE_URL}/api/workout/ocr`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`OCR failed: ${res.status}`);
    return res.json();
  },

  getGoogleAuthUrl: () =>
    fetchJson<{ url: string }>("/api/calendar/auth-url"),

  scheduleRecurring: (data: {
    user_id: string;
    days_of_week: number[];
    time: string;
    exercise_type: string;
    duration_minutes: number;
    google_token: string;
    weeks: number;
  }) =>
    fetchJson("/api/calendar/schedule/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
};
