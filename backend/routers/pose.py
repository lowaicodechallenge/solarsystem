from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import json

from database import get_db, WorkoutSession, User
from services.upstage_service import analyze_posture_with_llm
from services.rag_service import search_exercises

router = APIRouter(prefix="/api/pose", tags=["pose"])


class PoseAnalysisRequest(BaseModel):
    user_id: str
    exercise_type: str
    keypoints: dict
    angles: dict
    score: float
    session_id: str = ""


class PoseAnalysisResponse(BaseModel):
    feedback: dict
    recommended_exercises: list[dict]
    score: float


@router.post("/analyze", response_model=PoseAnalysisResponse)
async def analyze_pose(req: PoseAnalysisRequest, db: AsyncSession = Depends(get_db)):
    # Get user symptoms
    user = await db.get(User, req.user_id)
    symptoms = user.symptoms if user else ""

    # Identify posture issues from angles
    posture_issues = _detect_posture_issues(req.exercise_type, req.angles)

    # Get LLM feedback
    feedback = await analyze_posture_with_llm(
        exercise_type=req.exercise_type,
        keypoints=req.keypoints,
        angles=req.angles,
        score=req.score,
        symptoms=symptoms,
    )

    # RAG: find relevant exercises
    recommended = search_exercises(
        symptoms=symptoms,
        posture_issues=posture_issues,
        exercise_type=req.exercise_type,
        n_results=3,
    )

    return PoseAnalysisResponse(
        feedback=feedback,
        recommended_exercises=recommended,
        score=req.score,
    )


@router.post("/session/save")
async def save_session(
    user_id: str,
    exercise_type: str,
    duration: int,
    avg_score: float,
    pose_signature: list[float] = Query(default=[]),
    corrections: list[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    session = WorkoutSession(
        user_id=user_id,
        exercise_type=exercise_type,
        duration_seconds=duration,
        avg_score=avg_score,
        pose_signature=json.dumps(pose_signature),
        corrections=json.dumps(corrections),
    )
    db.add(session)
    await db.commit()
    return {"status": "saved", "session_id": session.id}


@router.get("/history/{user_id}")
async def get_history(user_id: str, limit: int = 10, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user_id)
        .order_by(WorkoutSession.created_at.desc())
        .limit(limit)
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "exercise_type": s.exercise_type,
            "duration_seconds": s.duration_seconds,
            "avg_score": s.avg_score,
            "created_at": s.created_at.isoformat(),
        }
        for s in sessions
    ]


def _detect_posture_issues(exercise_type: str, angles: dict) -> list[str]:
    issues = []
    if exercise_type == "squat":
        left_knee = angles.get("left_knee", 90)
        right_knee = angles.get("right_knee", 90)
        if abs(left_knee - right_knee) > 15:
            issues.append("무릎 불균형")
        if left_knee < 70 or right_knee < 70:
            issues.append("무릎 과굴곡")
        back_angle = angles.get("back_inclination", 0)
        if back_angle > 45:
            issues.append("허리 과전굴")
    elif exercise_type == "pushup":
        elbow = angles.get("left_elbow", 90)
        if elbow < 60:
            issues.append("팔꿈치 과굴곡")
        hip = angles.get("hip_alignment", 0)
        if abs(hip) > 15:
            issues.append("체간 정렬 불량")
    elif exercise_type == "plank":
        hip = angles.get("hip_alignment", 0)
        if hip > 20:
            issues.append("엉덩이 처짐")
        if hip < -20:
            issues.append("엉덩이 들림")
    return issues
