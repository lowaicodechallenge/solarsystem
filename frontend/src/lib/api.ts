const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const N8N_WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ?? "";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export type HealthInfo = {
  user_profile?: {
    age?: number | null;
    gender?: string | null;
    height_cm?: number | null;
    weight_kg?: number | null;
  };
  medical_assessment?: {
    diagnosis?: string[];
    symptoms?: string[];
    affected_body_parts?: string[];
    exercise_restrictions?: string[];
    pain_level?: number | null;
    treatment_period?: string | null;
    rehabilitation_stage?: string | null;
    special_notes?: string | null;
  };
  body_composition?: {
    inbody_score?: number | null;
    weight_kg?: number | null;
    skeletal_muscle_mass_kg?: number | null;
    body_fat_mass_kg?: number | null;
    body_fat_percentage?: number | null;
    bmi?: number | null;
    waist_hip_ratio?: number | null;
    basal_metabolic_rate_kcal?: number | null;
    visceral_fat_level?: number | null;
    segmental_muscle_balance?: {
      left_arm?: number | null;
      right_arm?: number | null;
      trunk?: number | null;
      left_leg?: number | null;
      right_leg?: number | null;
    };
  };
  fitness_assessment?: {
    cardiovascular_endurance?: { score?: number | null; grade?: string | null; measurement?: string | null };
    muscular_strength?: { score?: number | null; grade?: string | null; measurement?: string | null };
    muscular_endurance?: { score?: number | null; grade?: string | null; measurement?: string | null };
    flexibility?: { score?: number | null; grade?: string | null; measurement?: string | null };
    agility?: { score?: number | null; grade?: string | null; measurement?: string | null };
    power?: { score?: number | null; grade?: string | null; measurement?: string | null };
    balance?: { score?: number | null; grade?: string | null; measurement?: string | null };
    overall_fitness_level?: string | null;
  };
};

export type NFAVideo = {
  source: "NFA_VIDEO_API";
  title: string;
  description: string;
  video_url: string;
  thumbnail_url: string;
  target_body_part: string[];
  purpose_tags: string[];
  level: "beginner" | "intermediate" | "advanced";
  intensity: "low" | "medium" | "high";
  place: "home" | "outdoor" | "gym";
  equipment: string;
  duration_min: number;
  avoid_if: string[];
  verification_status: "needs_review" | "approved" | "hidden";
  age_group: string;
};

export type ProcessDocumentResult = {
  document_category: "inbody" | "national_fitness_100" | "rehabilitation_guide" | "health_checkup" | "other";
  parsed_text: string;
  page_count: number;
  health_info: HealthInfo;
  risk_tags: string[];
};

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
    health_info?: HealthInfo;
    risk_tags?: string[];
  }) =>
    fetchJson("/api/workout/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getNFAVideos: (data: {
    age?: number;
    goal?: string;
    pain_area?: string[];
    place?: string;
    level?: string;
    available_time_min?: number;
    health_info?: HealthInfo;
    risk_tags?: string[];
    max_results?: number;
  }) =>
    fetchJson<{ videos: NFAVideo[]; count: number }>("/api/workout/nfa-videos", {
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
    const res = await fetch(`${BASE_URL}/api/workout/ocr`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`OCR failed: ${res.status}`);
    return res.json();
  },

  processDocument: async (
    file: File,
    opts?: { user_id?: string; symptoms?: string; google_token?: string; scheduled_time?: string }
  ): Promise<ProcessDocumentResult> => {
    const form = new FormData();
    form.append("file", file);
    if (opts?.user_id) form.append("user_id", opts.user_id);
    if (opts?.symptoms) form.append("symptoms", opts.symptoms);
    if (opts?.google_token) form.append("google_token", opts.google_token);
    if (opts?.scheduled_time) form.append("scheduled_time", opts.scheduled_time);
    const url = N8N_WEBHOOK_URL || `${BASE_URL}/api/workout/process-document`;
    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Document processing failed: ${res.status}`);
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

  sendReportEmail: (data: {
    email: string;
    stats: WeeklyReportResult["stats"];
    report: WeeklyReportResult["report"];
    generated_at: string;
  }) =>
    fetchJson<{ status: string }>("/api/report/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getWeeklyReport: (data: {
    user_id: string;
    period_days?: number;
    symptoms?: string;
    risk_tags?: string[];
    posture_scores?: { front?: number; side?: number };
    gcal_session_count?: number;
  }) =>
    fetchJson<WeeklyReportResult>("/api/report/weekly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
};

export type WeeklyReportResult = {
  stats: {
    period_days: number;
    session_count: number;
    gcal_session_count: number;
    avg_score: number;
    best_score: number;
    worst_score: number;
    score_trend: string;
    exercise_breakdown: Record<string, number>;
  };
  report: {
    headline: string;
    summary: string;
    achievements: string[];
    improvements: string[];
    next_week_focus: string[];
    caution: string;
  };
  generated_at: string;
};
