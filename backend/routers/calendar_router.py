from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
import json
import os

from database import get_db, ScheduledWorkout, User

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/auth/callback")


class ScheduleRequest(BaseModel):
    user_id: str
    exercise_type: str
    scheduled_time: str  # ISO format
    duration_minutes: int = 30
    google_token: str = ""


class WorkoutSchedule(BaseModel):
    user_id: str
    days_of_week: list[int]  # 0=Monday, 6=Sunday
    time: str  # "HH:MM"
    exercise_type: str
    duration_minutes: int = 30
    weeks: int = 4
    google_token: str = ""


def _build_google_event(exercise_type: str, start_dt: datetime, duration_minutes: int) -> dict:
    end_dt = start_dt + timedelta(minutes=duration_minutes)
    exercise_names = {
        "squat": "스쿼트 운동",
        "pushup": "푸시업 운동",
        "plank": "플랭크 운동",
        "stretch": "스트레칭",
    }
    name = exercise_names.get(exercise_type, f"{exercise_type} 운동")
    return {
        "summary": f"💪 FitAI - {name}",
        "description": f"FitAI 맞춤 {name} 세션\n웹캠이 자동으로 활성화됩니다.",
        "start": {"dateTime": start_dt.isoformat(), "timeZone": "Asia/Seoul"},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": "Asia/Seoul"},
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "popup", "minutes": 10},
                {"method": "popup", "minutes": 1},
            ],
        },
        "colorId": "2",
    }


async def _create_google_event(token: str, event: dict) -> str:
    """Create Google Calendar event, returns event ID."""
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {token}"},
            json=event,
        )
        if resp.status_code == 200 or resp.status_code == 201:
            return resp.json().get("id", "")
    return ""


@router.post("/schedule")
async def schedule_workout(req: ScheduleRequest, db: AsyncSession = Depends(get_db)):
    scheduled_dt = datetime.fromisoformat(req.scheduled_time)

    google_event_id = ""
    if req.google_token:
        event = _build_google_event(req.exercise_type, scheduled_dt, req.duration_minutes)
        google_event_id = await _create_google_event(req.google_token, event)

    workout = ScheduledWorkout(
        user_id=req.user_id,
        exercise_type=req.exercise_type,
        scheduled_time=scheduled_dt,
        google_event_id=google_event_id,
    )
    db.add(workout)
    await db.commit()

    return {
        "id": workout.id,
        "scheduled_time": scheduled_dt.isoformat(),
        "exercise_type": req.exercise_type,
        "google_event_id": google_event_id,
        "status": "scheduled",
    }


@router.post("/schedule/recurring")
async def schedule_recurring(req: WorkoutSchedule, db: AsyncSession = Depends(get_db)):
    hour, minute = map(int, req.time.split(":"))
    now = datetime.now()
    created = []

    for week in range(req.weeks):
        for dow in req.days_of_week:
            days_until = (dow - now.weekday()) % 7 + week * 7
            target_dt = (now + timedelta(days=days_until)).replace(
                hour=hour, minute=minute, second=0, microsecond=0
            )
            if target_dt <= now:
                target_dt += timedelta(days=7)

            google_event_id = ""
            if req.google_token:
                event = _build_google_event(req.exercise_type, target_dt, req.duration_minutes)
                google_event_id = await _create_google_event(req.google_token, event)

            workout = ScheduledWorkout(
                user_id=req.user_id,
                exercise_type=req.exercise_type,
                scheduled_time=target_dt,
                google_event_id=google_event_id,
            )
            db.add(workout)
            created.append({"time": target_dt.isoformat(), "google_event_id": google_event_id})

    await db.commit()
    return {"created": len(created), "schedules": created}


@router.get("/upcoming/{user_id}")
async def get_upcoming(user_id: str, db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    result = await db.execute(
        select(ScheduledWorkout)
        .where(
            ScheduledWorkout.user_id == user_id,
            ScheduledWorkout.scheduled_time >= now,
            ScheduledWorkout.is_completed == False,
        )
        .order_by(ScheduledWorkout.scheduled_time)
        .limit(20)
    )
    workouts = result.scalars().all()
    return [
        {
            "id": w.id,
            "exercise_type": w.exercise_type,
            "scheduled_time": w.scheduled_time.isoformat(),
            "google_event_id": w.google_event_id,
        }
        for w in workouts
    ]


@router.get("/auth-url")
async def get_auth_url():
    scope = "https://www.googleapis.com/auth/calendar.events"
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={GOOGLE_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope={scope}"
        f"&access_type=offline"
        f"&prompt=consent"
    )
    return {"url": auth_url}


@router.post("/token")
async def exchange_token(code: str):
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if resp.status_code == 200:
            return resp.json()
    raise HTTPException(status_code=400, detail="Token exchange failed")
