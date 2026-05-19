from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, WorkoutSession, User
from services.upstage_service import generate_weekly_report

router = APIRouter(prefix="/api/report", tags=["report"])


class WeeklyReportRequest(BaseModel):
    user_id: str
    period_days: int = 7
    symptoms: str = ""
    risk_tags: list[str] = []
    posture_scores: dict = {}  # {"front": 78, "side": 65} — 프론트 localStorage 기반


def _build_stats(sessions: list[WorkoutSession], period_days: int) -> dict:
    if not sessions:
        return {
            "period_days": period_days,
            "session_count": 0,
            "avg_score": 0.0,
            "best_score": 0.0,
            "worst_score": 0.0,
            "score_trend": "데이터 부족",
            "exercise_breakdown": {},
        }

    scores = [s.avg_score for s in sessions]
    # sessions는 created_at 내림차순 → 시간순(오래된→최신)으로 추세 판단
    chrono = list(reversed(sessions))
    if len(chrono) >= 2:
        half = len(chrono) // 2
        early = sum(s.avg_score for s in chrono[:half]) / max(half, 1)
        late = sum(s.avg_score for s in chrono[half:]) / max(len(chrono) - half, 1)
        diff = late - early
        trend = "상승" if diff > 3 else ("하락" if diff < -3 else "유지")
    else:
        trend = "데이터 부족"

    breakdown: dict[str, int] = {}
    for s in sessions:
        breakdown[s.exercise_type] = breakdown.get(s.exercise_type, 0) + 1

    return {
        "period_days": period_days,
        "session_count": len(sessions),
        "avg_score": sum(scores) / len(scores),
        "best_score": max(scores),
        "worst_score": min(scores),
        "score_trend": trend,
        "exercise_breakdown": breakdown,
    }


@router.post("/weekly")
async def weekly_report(req: WeeklyReportRequest, db: AsyncSession = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=req.period_days)
    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == req.user_id)
        .where(WorkoutSession.created_at >= since)
        .order_by(WorkoutSession.created_at.desc())
    )
    sessions = list(result.scalars().all())

    symptoms = req.symptoms
    if not symptoms:
        user = await db.get(User, req.user_id)
        symptoms = user.symptoms if user else ""

    stats = _build_stats(sessions, req.period_days)
    report = await generate_weekly_report(
        stats=stats,
        symptoms=symptoms,
        risk_tags=req.risk_tags,
        posture_scores=req.posture_scores,
    )

    return {
        "stats": stats,
        "report": report,
        "generated_at": datetime.utcnow().isoformat(),
    }
