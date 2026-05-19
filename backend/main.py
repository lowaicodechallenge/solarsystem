import os
import sys

# Windows 한국어 콘솔(cp949)에서 이모지/유니코드 print가 UnicodeEncodeError로
# 서버를 죽이는 것을 방지 — stdout/stderr를 UTF-8로 재설정.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
from dotenv import load_dotenv

load_dotenv()

from database import init_db
from routers import pose, workout, battle, calendar_router, chat, report
from services.matching_service import update_battle_score

# Socket.IO for real-time battle
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=os.getenv("FRONTEND_URL", "http://localhost:3000"),
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Initialize RAG (seeds ChromaDB if empty)
    from services.rag_service import get_collection
    get_collection()
    print("✅ Database and RAG initialized")
    yield


app = FastAPI(
    title="FitAI API",
    description="AI-powered fitness coaching with pose detection",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pose.router)
app.include_router(workout.router)
app.include_router(battle.router)
app.include_router(calendar_router.router)
app.include_router(chat.router)
app.include_router(report.router)


@app.get("/")
async def root():
    return {"status": "FitAI API running", "version": "1.0.0"}


@app.get("/health")
async def health():
    from services.llm_provider import provider_info
    return {"status": "healthy", **provider_info()}


# ─── Socket.IO Events ────────────────────────────────────────────────────────

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")


@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")


@sio.event
async def join_battle_room(sid, data):
    battle_id = data.get("battle_id")
    if battle_id:
        await sio.enter_room(sid, battle_id)
        await sio.emit("joined_room", {"battle_id": battle_id}, to=sid)


@sio.event
async def battle_score_update(sid, data):
    battle_id = data.get("battle_id")
    user_id = data.get("user_id")
    score = data.get("score", 0.0)

    battle = update_battle_score(battle_id, user_id, score)
    if battle:
        await sio.emit(
            "score_updated",
            {
                "user1_score": battle["user1_score"],
                "user2_score": battle["user2_score"],
            },
            room=battle_id,
        )


@sio.event
async def pose_frame(sid, data):
    # Broadcast pose frame to battle partner
    battle_id = data.get("battle_id")
    if battle_id:
        await sio.emit("opponent_pose", data, room=battle_id, skip_sid=sid)


# Mount Socket.IO
socket_app = socketio.ASGIApp(sio, app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(socket_app, host="0.0.0.0", port=8000, reload=False)
