"use client";
import { useState, useEffect, useCallback } from "react";
import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
import { format, addDays, startOfDay, setHours, setMinutes } from "date-fns";
import { ko } from "date-fns/locale";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "1028156401008-163i48haeg8riirt6t1fqeq9g223qghg.apps.googleusercontent.com";
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 ~ 22:00
const DAYS = 7;

type BusySlot = { start: string; end: string };
type SelectedSlot = { date: Date; hour: number };

function CalendarViewInner({ userId: _userId }: { userId: string }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);
  const [selected, setSelected] = useState<SelectedSlot[]>([]);
  const [loadingBusy, setLoadingBusy] = useState(false);
  const [creatingEvents, setCreatingEvents] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("gcal_access_token");
    if (saved) setAccessToken(saved);
  }, []);

  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      const token = tokenResponse.access_token;
      setAccessToken(token);
      localStorage.setItem("gcal_access_token", token);
    },
    onError: () => alert("Google 로그인에 실패했습니다."),
    scope: "https://www.googleapis.com/auth/calendar",
  });

  const fetchBusy = useCallback(async (token: string) => {
    setLoadingBusy(true);
    const today = startOfDay(new Date());
    try {
      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin: today.toISOString(),
          timeMax: addDays(today, DAYS).toISOString(),
          items: [{ id: "primary" }],
        }),
      });
      if (res.status === 401) {
        setAccessToken(null);
        localStorage.removeItem("gcal_access_token");
        return;
      }
      const data = await res.json();
      setBusySlots(data.calendars?.primary?.busy ?? []);
    } catch {
      // keep empty on network error
    }
    setLoadingBusy(false);
  }, []);

  useEffect(() => {
    if (accessToken) fetchBusy(accessToken);
  }, [accessToken, fetchBusy]);

  const today = startOfDay(new Date());
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i));

  const isBusy = (date: Date, hour: number): boolean => {
    const slotStart = setHours(setMinutes(date, 0), hour).getTime();
    const slotEnd = slotStart + 60 * 60 * 1000;
    return busySlots.some((b) => {
      const bStart = new Date(b.start).getTime();
      const bEnd = new Date(b.end).getTime();
      return bStart < slotEnd && bEnd > slotStart;
    });
  };

  const isSelected = (date: Date, hour: number) =>
    selected.some(
      (s) => s.date.toDateString() === date.toDateString() && s.hour === hour
    );

  const toggleSlot = (date: Date, hour: number) => {
    if (isBusy(date, hour)) return;
    setSelected((prev) =>
      isSelected(date, hour)
        ? prev.filter(
            (s) => !(s.date.toDateString() === date.toDateString() && s.hour === hour)
          )
        : [...prev, { date, hour }]
    );
  };

  const createEvents = async () => {
    if (!accessToken || selected.length === 0) return;
    setCreatingEvents(true);
    for (const slot of selected) {
      const start = setHours(setMinutes(slot.date, 0), slot.hour);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: "🏋️ 솔메이트 운동",
          description: "솔메이트 AI 피트니스 코치 운동 일정",
          start: { dateTime: start.toISOString(), timeZone: "Asia/Seoul" },
          end: { dateTime: end.toISOString(), timeZone: "Asia/Seoul" },
          reminders: {
            useDefault: false,
            overrides: [{ method: "popup", minutes: 10 }],
          },
        }),
      });
    }
    setDone(true);
    setSelected([]);
    setCreatingEvents(false);
    await fetchBusy(accessToken);
  };

  if (!accessToken) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6">
        <div className="text-6xl">📅</div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#101c2a] mb-2">Google Calendar 연동</h2>
          <p className="text-sm text-[#42484a] leading-relaxed">
            Google Calendar를 연동하면 빈 시간대를 자동으로 찾아<br />
            운동 일정을 등록해드립니다.
          </p>
        </div>
        <button
          onClick={() => login()}
          className="flex items-center gap-3 px-6 py-3 bg-white border border-[#c1c7c9] rounded-xl shadow-sm hover:shadow-md text-[#101c2a] font-medium transition-all"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google 계정으로 연동하기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[#101c2a]">
            {loadingBusy ? "캘린더 조회 중..." : "운동할 시간대를 선택하세요"}
          </p>
          <p className="text-xs text-[#72787a] mt-0.5">
            초록색 = 빈 시간 &middot; 파란색 = 선택됨 &middot; 회색 = 이미 일정 있음
          </p>
        </div>
        <button
          onClick={() => {
            setAccessToken(null);
            localStorage.removeItem("gcal_access_token");
            setBusySlots([]);
            setSelected([]);
          }}
          className="text-xs text-[#72787a] hover:text-red-400 transition-colors"
        >
          연결 해제
        </button>
      </div>

      {/* When2Meet grid */}
      <div className="bg-white border border-[#c1c7c9] rounded-xl overflow-hidden">
        {/* Day headers */}
        <div
          className="grid border-b border-[#e5e8ed] bg-[#f8f9ff]"
          style={{ gridTemplateColumns: "44px repeat(7, 1fr)" }}
        >
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className="text-center py-2 border-l border-[#e5e8ed]">
              <p className="text-[10px] text-[#72787a]">{format(d, "EEE", { locale: ko })}</p>
              <p className="text-sm font-bold text-[#101c2a]">{format(d, "d")}</p>
            </div>
          ))}
        </div>

        {/* Time rows */}
        <div className="overflow-y-auto max-h-[440px]">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="grid border-b border-[#e5e8ed] last:border-0"
              style={{ gridTemplateColumns: "44px repeat(7, 1fr)" }}
            >
              <div className="flex items-center justify-end pr-2">
                <span className="text-[10px] text-[#72787a]">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
              {days.map((d) => {
                const busy = isBusy(d, hour);
                const sel = isSelected(d, hour);
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => toggleSlot(d, hour)}
                    disabled={busy}
                    aria-label={`${format(d, "M/d")} ${hour}시`}
                    className={`h-8 border-l border-[#e5e8ed] transition-colors ${
                      busy
                        ? "bg-[#eeeeee] cursor-not-allowed"
                        : sel
                        ? "bg-[#2f628c] hover:bg-[#245277]"
                        : "bg-[#e8f5e9] hover:bg-[#b2dfdb]"
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Selected slots summary */}
      {selected.length > 0 && (
        <div className="bg-[#eff4ff] border border-[#c1c7c9] rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-[#101c2a]">
            선택한 운동 시간 ({selected.length}개, 각 1시간)
          </p>
          <div className="flex flex-wrap gap-2">
            {selected.map((s) => (
              <span
                key={`${s.date.toDateString()}-${s.hour}`}
                className="px-2 py-1 bg-white border border-[#c1c7c9] rounded-lg text-xs text-[#101c2a]"
              >
                {format(s.date, "M/d (EEE)", { locale: ko })}{" "}
                {String(s.hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          <button
            onClick={createEvents}
            disabled={creatingEvents}
            className="w-full py-3 bg-[#2f628c] hover:opacity-90 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition-all"
          >
            {creatingEvents
              ? "캘린더에 등록 중..."
              : `Google Calendar에 ${selected.length}개 운동 블록 등록`}
          </button>
        </div>
      )}

      {done && (
        <div className="bg-[#e8f5e9] border border-[#a5d6a7] rounded-xl p-4 text-center">
          <p className="text-[#2e7d32] font-bold text-sm">
            ✅ 운동 일정이 Google Calendar에 등록되었습니다!
          </p>
          <button
            onClick={() => setDone(false)}
            className="mt-2 text-xs text-[#42484a] hover:underline"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

export default function CalendarView({ userId }: { userId: string }) {
  if (!CLIENT_ID) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="text-5xl">⚙️</div>
        <p className="text-[#101c2a] font-bold">Google Client ID 미설정</p>
        <p className="text-sm text-[#42484a]">
          프론트엔드 <code className="bg-gray-100 px-1 rounded text-xs">.env.local</code>에{" "}
          <code className="bg-gray-100 px-1 rounded text-xs">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>를
          추가해주세요.
        </p>
      </div>
    );
  }
  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <CalendarViewInner userId={userId} />
    </GoogleOAuthProvider>
  );
}
