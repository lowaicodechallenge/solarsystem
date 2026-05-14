import os
import httpx
from fastapi import APIRouter, Depends, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db, WorkoutSession, User
from services.upstage_service import generate_workout_routine, analyze_current_state
from services.rag_service import search_exercises

router = APIRouter(prefix="/api/workout", tags=["workout"])


class RoutineRequest(BaseModel):
    user_id: str
    pose_summary: str = ""
    posture_issues: list[str] = []


class RecommendRequest(BaseModel):
    user_id: str
    posture_issues: list[str] = []
    front_score: float = 0
    side_score: float = 0
    symptoms: str = ""
    doc_text: str = ""


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


@router.post("/recommend")
async def recommend_exercises(req: RecommendRequest, db: AsyncSession = Depends(get_db)):
    # Symptoms: use request value; fall back to DB
    symptoms = req.symptoms
    if not symptoms:
        user = await db.get(User, req.user_id)
        symptoms = user.symptoms if user else ""

    rag_exercises = search_exercises(
        symptoms=symptoms + " " + req.doc_text,
        posture_issues=req.posture_issues,
        n_results=5,
    )

    analysis = await analyze_current_state(
        posture_issues=req.posture_issues,
        front_score=req.front_score,
        side_score=req.side_score,
        symptoms=symptoms,
        doc_text=req.doc_text,
        rag_exercises=rag_exercises,
    )

    return {
        "analysis": analysis,
        "exercises": [
            {
                "id": ex["id"],
                "name": ex["name"],
                "description": ex["description"],
                "youtube_query": ex["youtube_query"],
                "difficulty": ex["difficulty"],
                "duration_minutes": ex["duration_minutes"],
                "reason": analysis.get("exercise_reasons", {}).get(ex["name"], ""),
            }
            for ex in rag_exercises[:4]
        ],
    }


@router.post("/ocr")
async def ocr_document(file: UploadFile = File(...)):
    """Upstage Document Parse로 파일에서 텍스트 추출."""
    upstage_key = os.getenv("UPSTAGE_API_KEY", "")
    if not upstage_key:
        return {"text": ""}

    content = await file.read()
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            "https://api.upstage.ai/v1/document-ai/document-parse",
            headers={"Authorization": f"Bearer {upstage_key}"},
            files={"document": (file.filename, content, file.content_type)},
        )
        if r.status_code != 200:
            return {"text": ""}
        data = r.json()
        text = data.get("content", {}).get("text", "")
        return {"text": text}


@router.get("/videos")
async def search_videos(query: str, max_results: int = 4):
    """YouTube Data API v3로 운동 영상 검색. API 키 없으면 search_url만 반환."""
    yt_key = os.getenv("VIDEO_API_KEY", "")
    encoded = query.replace(" ", "+")
    fallback_url = f"https://www.youtube.com/results?search_query={encoded}"

    if not yt_key:
        return {"videos": [], "search_url": fallback_url}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "key": yt_key,
                "q": query,
                "part": "snippet",
                "type": "video",
                "maxResults": max_results,
                "relevanceLanguage": "ko",
            },
        )
        if r.status_code != 200:
            return {"videos": [], "search_url": fallback_url}

        videos = [
            {
                "video_id": item["id"]["videoId"],
                "title": item["snippet"]["title"],
                "channel": item["snippet"]["channelTitle"],
                "thumbnail": item["snippet"]["thumbnails"]["medium"]["url"],
                "url": f"https://www.youtube.com/watch?v={item['id']['videoId']}",
            }
            for item in r.json().get("items", [])
        ]
        return {"videos": videos, "search_url": None}


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
        user = User(id=user_id, name="User", symptoms=symptoms)
        db.add(user)
    else:
        user.symptoms = symptoms
    await db.commit()
    return {"status": "updated"}
