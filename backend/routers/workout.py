from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import json

from database import get_db, WorkoutSession, User
from services.upstage_service import generate_workout_routine
from services.rag_service import search_exercises

router = APIRouter(prefix="/api/workout", tags=["workout"])


class RoutineRequest(BaseModel):
    user_id: str
    pose_summary: str = ""
    posture_issues: list[str] = []


@router.post("/routine")
async def get_routine(req: RoutineRequest, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, req.user_id)
    symptoms = user.symptoms if user else ""

    rag_exercises = search_exercises(
        symptoms=symptoms,
        posture_issues=req.posture_issues,
        n_results=5,
    )

    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == req.user_id)
        .order_by(WorkoutSession.created_at.desc())
        .limit(5)
    )
    history = [
        {"exercise_type": s.exercise_type, "avg_score": s.avg_score}
        for s in result.scalars().all()
    ]

    routine = await generate_workout_routine(
        pose_analysis={"summary": req.pose_summary},
        symptoms=symptoms,
        rag_exercises=rag_exercises,
        user_history=history,
    )

    return {
        "routine": routine,
        "rag_exercises": rag_exercises[:3],
    }


@router.get("/exercises")
async def list_exercises(category: str = "", difficulty: int = 0):
    exercises = search_exercises(
        symptoms="",
        posture_issues=[category] if category else [],
        n_results=10,
    )
    if difficulty:
        exercises = [e for e in exercises if e.get("difficulty", 0) == difficulty]
    return {"exercises": exercises}


@router.get("/youtube-search")
async def youtube_search_query(query: str):
    encoded = query.replace(" ", "+")
    return {
        "search_url": f"https://www.youtube.com/results?search_query={encoded}",
        "embed_search": f"https://www.youtube.com/embed?listType=search&list={encoded}",
    }


@router.put("/user/symptoms")
async def update_symptoms(
    user_id: str,
    symptoms: str,
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        from database import User
        user = User(id=user_id, name="User", symptoms=symptoms)
        db.add(user)
    else:
        user.symptoms = symptoms
    await db.commit()
    return {"status": "updated"}
