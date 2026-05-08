from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, Boolean, JSON
from datetime import datetime
import uuid

DATABASE_URL = "sqlite+aiosqlite:///./fitness.db"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    email = Column(String, unique=True)
    google_token = Column(Text, nullable=True)
    symptoms = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False)
    exercise_type = Column(String, nullable=False)
    duration_seconds = Column(Integer, default=0)
    avg_score = Column(Float, default=0.0)
    pose_signature = Column(Text, default="[]")
    corrections = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow)


class Battle(Base):
    __tablename__ = "battles"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user1_id = Column(String, nullable=False)
    user2_id = Column(String, nullable=False)
    exercise_type = Column(String, nullable=False)
    user1_score = Column(Float, default=0.0)
    user2_score = Column(Float, default=0.0)
    status = Column(String, default="waiting")
    created_at = Column(DateTime, default=datetime.utcnow)


class ScheduledWorkout(Base):
    __tablename__ = "scheduled_workouts"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False)
    exercise_type = Column(String, nullable=False)
    scheduled_time = Column(DateTime, nullable=False)
    google_event_id = Column(String, nullable=True)
    is_completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
