from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db, User
from services.upstage_service import call_solar
from services.rag_service import get_rehab_advice, search_exercises

router = APIRouter(prefix="/api/chat", tags=["chat"])

# In-memory chat history per user (in production use Redis/DB)
_chat_histories: dict[str, list[dict]] = {}


class ChatMessage(BaseModel):
    user_id: str
    message: str
    pose_context: dict = {}


class ChatResponse(BaseModel):
    reply: str
    suggested_exercises: list[dict]
    updated_symptoms: str


SYSTEM_PROMPT = """당신은 AI 피트니스 코치이자 물리치료 상담사입니다.
사용자의 신체 증상, 불편함, 자세 문제를 파악하고 맞춤형 운동과 자세 교정 방법을 안내합니다.
대화를 통해 증상을 파악하고, 자세 분석 데이터가 있으면 함께 활용하세요.
항상 따뜻하고 전문적인 어조를 유지하며, 심각한 통증이나 부상은 반드시 의사 상담을 권유하세요.
응답은 한국어로, 200자 이내로 간결하게 하세요."""


def _extract_symptoms(conversation: list[dict]) -> str:
    symptom_keywords = [
        "통증", "아프", "불편", "뻐근", "저림", "두통", "편두통",
        "어깨", "허리", "무릎", "목", "거북목", "피로"
    ]
    symptoms = set()
    for msg in conversation:
        if msg["role"] == "user":
            for kw in symptom_keywords:
                if kw in msg["content"]:
                    symptoms.add(kw)
    return ", ".join(symptoms) if symptoms else ""


@router.post("/message", response_model=ChatResponse)
async def send_message(req: ChatMessage, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, req.user_id)
    current_symptoms = user.symptoms if user else ""

    history = _chat_histories.setdefault(req.user_id, [])

    pose_context_text = ""
    if req.pose_context:
        exercise = req.pose_context.get("exercise_type", "")
        score = req.pose_context.get("score", 0)
        issues = req.pose_context.get("issues", [])
        pose_context_text = f"\n[자세 분석 데이터] 운동: {exercise}, 점수: {score:.0f}점, 문제: {', '.join(issues)}"

    user_msg = req.message + pose_context_text
    history.append({"role": "user", "content": user_msg})

    # Keep last 10 messages
    if len(history) > 10:
        history = history[-10:]
    _chat_histories[req.user_id] = history

    reply = await call_solar(
        messages=history,
        system_prompt=SYSTEM_PROMPT,
        temperature=0.7,
        max_tokens=300,
    )

    history.append({"role": "assistant", "content": reply})
    _chat_histories[req.user_id] = history

    # Extract symptoms from conversation
    new_symptoms = _extract_symptoms(history)
    if new_symptoms and user:
        combined = ", ".join(set((current_symptoms + ", " + new_symptoms).split(", "))) if current_symptoms else new_symptoms
        user.symptoms = combined
        await db.commit()
        current_symptoms = combined

    # Get exercise recommendations
    posture_issues = req.pose_context.get("issues", [])
    suggested = search_exercises(
        symptoms=current_symptoms,
        posture_issues=posture_issues,
        n_results=2,
    )

    return ChatResponse(
        reply=reply,
        suggested_exercises=suggested,
        updated_symptoms=current_symptoms,
    )


@router.get("/history/{user_id}")
async def get_history(user_id: str):
    return {"history": _chat_histories.get(user_id, [])}


@router.delete("/history/{user_id}")
async def clear_history(user_id: str):
    _chat_histories.pop(user_id, None)
    return {"status": "cleared"}
