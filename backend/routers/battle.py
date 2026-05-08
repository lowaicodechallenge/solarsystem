from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, Battle
from services.matching_service import (
    join_matchmaking,
    leave_matchmaking,
    update_battle_score,
    end_battle,
    get_waiting_count,
)

router = APIRouter(prefix="/api/battle", tags=["battle"])


class JoinRequest(BaseModel):
    user_id: str
    exercise_type: str
    pose_signature: list[float] = []
    socket_sid: str = ""


class ScoreUpdate(BaseModel):
    battle_id: str
    user_id: str
    score: float


@router.post("/join")
async def join_battle(req: JoinRequest, db: AsyncSession = Depends(get_db)):
    result = join_matchmaking(
        user_id=req.user_id,
        exercise_type=req.exercise_type,
        pose_signature=req.pose_signature,
        socket_sid=req.socket_sid,
    )
    if result:
        battle = Battle(
            id=result["battle_id"],
            user1_id=result["user1"]["user_id"],
            user2_id=result["user2"]["user_id"],
            exercise_type=result["exercise_type"],
            status="active",
        )
        db.add(battle)
        await db.commit()
        return {"status": "matched", "battle": result}
    return {
        "status": "waiting",
        "waiting_count": get_waiting_count(req.exercise_type),
        "message": f"{req.exercise_type} 대결 상대를 찾는 중입니다...",
    }


@router.post("/score")
async def update_score(req: ScoreUpdate):
    battle = update_battle_score(req.battle_id, req.user_id, req.score)
    if not battle:
        return {"error": "Battle not found"}
    return {
        "battle_id": req.battle_id,
        "user1_score": battle["user1_score"],
        "user2_score": battle["user2_score"],
    }


@router.post("/end/{battle_id}")
async def finish_battle(battle_id: str, db: AsyncSession = Depends(get_db)):
    result = end_battle(battle_id)
    if not result:
        return {"error": "Battle not found"}

    db_battle = await db.get(Battle, battle_id)
    if db_battle:
        db_battle.user1_score = result["user1_score"]
        db_battle.user2_score = result["user2_score"]
        db_battle.status = "finished"
        await db.commit()

    return {
        "battle_id": battle_id,
        "winner": result.get("winner"),
        "user1_score": result["user1_score"],
        "user2_score": result["user2_score"],
        "status": "finished",
    }


@router.delete("/leave/{user_id}")
async def leave_battle(user_id: str):
    leave_matchmaking(user_id)
    return {"status": "left"}


@router.get("/waiting/{exercise_type}")
async def waiting_count(exercise_type: str):
    count = get_waiting_count(exercise_type)
    return {"exercise_type": exercise_type, "waiting": count}
