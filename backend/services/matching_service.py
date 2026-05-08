import json
import numpy as np
from typing import Optional
from datetime import datetime

# In-memory waiting room: {user_id: {exercise_type, pose_signature, joined_at, socket_sid}}
_waiting_room: dict[str, dict] = {}
_active_battles: dict[str, dict] = {}


def join_matchmaking(user_id: str, exercise_type: str, pose_signature: list[float], socket_sid: str) -> Optional[dict]:
    """Add user to matchmaking pool. Returns battle info if matched."""
    _waiting_room[user_id] = {
        "exercise_type": exercise_type,
        "pose_signature": pose_signature,
        "joined_at": datetime.utcnow().isoformat(),
        "socket_sid": socket_sid,
        "user_id": user_id,
    }

    match = _find_best_match(user_id, exercise_type, pose_signature)
    if match:
        battle_id = f"battle_{user_id[:8]}_{match['user_id'][:8]}"
        battle_info = {
            "battle_id": battle_id,
            "user1": _waiting_room[user_id],
            "user2": match,
            "exercise_type": exercise_type,
            "started_at": datetime.utcnow().isoformat(),
            "user1_score": 0.0,
            "user2_score": 0.0,
            "status": "active",
        }
        _active_battles[battle_id] = battle_info
        del _waiting_room[user_id]
        del _waiting_room[match["user_id"]]
        return battle_info
    return None


def _find_best_match(user_id: str, exercise_type: str, pose_signature: list[float]) -> Optional[dict]:
    candidates = [
        v for k, v in _waiting_room.items()
        if k != user_id and v["exercise_type"] == exercise_type
    ]
    if not candidates:
        return None

    if not pose_signature:
        return candidates[0]

    user_vec = np.array(pose_signature, dtype=float)
    best_score = -1.0
    best_match = None

    for candidate in candidates:
        cand_sig = candidate.get("pose_signature", [])
        if not cand_sig:
            continue
        cand_vec = np.array(cand_sig, dtype=float)
        min_len = min(len(user_vec), len(cand_vec))
        if min_len == 0:
            continue
        u = user_vec[:min_len]
        c = cand_vec[:min_len]
        norm_u = np.linalg.norm(u)
        norm_c = np.linalg.norm(c)
        if norm_u == 0 or norm_c == 0:
            continue
        similarity = float(np.dot(u, c) / (norm_u * norm_c))
        if similarity > best_score:
            best_score = similarity
            best_match = candidate

    # Accept any match for demo; in production use threshold ~0.7
    return best_match or (candidates[0] if candidates else None)


def update_battle_score(battle_id: str, user_id: str, score: float) -> Optional[dict]:
    battle = _active_battles.get(battle_id)
    if not battle:
        return None
    if battle["user1"]["user_id"] == user_id:
        battle["user1_score"] = score
    elif battle["user2"]["user_id"] == user_id:
        battle["user2_score"] = score
    return battle


def end_battle(battle_id: str) -> Optional[dict]:
    battle = _active_battles.get(battle_id)
    if not battle:
        return None
    battle["status"] = "finished"
    if battle["user1_score"] > battle["user2_score"]:
        battle["winner"] = battle["user1"]["user_id"]
    elif battle["user2_score"] > battle["user1_score"]:
        battle["winner"] = battle["user2"]["user_id"]
    else:
        battle["winner"] = "draw"
    del _active_battles[battle_id]
    return battle


def leave_matchmaking(user_id: str):
    _waiting_room.pop(user_id, None)


def get_waiting_count(exercise_type: str = "") -> int:
    if exercise_type:
        return sum(1 for v in _waiting_room.values() if v["exercise_type"] == exercise_type)
    return len(_waiting_room)
