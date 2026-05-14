# FitAI - AI 피트니스 코치

웹캠 + AI 자세 분석 기반 맞춤형 홈 트레이닝 서비스

## 주요 기능

| 기능 | 설명 |
|------|------|
| 실시간 자세 분석 | MediaPipe + TensorFlow.js로 웹캠에서 즉시 자세 교정 피드백 |
| AI 운동 루틴 | LLM이 자세 분석 + 증상 기반 맞춤 루틴 생성 |
| RAG 재활 운동 | ChromaDB 벡터 DB에서 증상/자세에 맞는 운동 검색 및 추천 |
| AI 코치 챗봇 | 증상 입력 → LLM 문맥 파악 → 자세 분석과 통합 처리 |
| 실시간 대결 | 유사 자세 문제 사용자와 WebSocket 기반 60초 운동 배틀 |
| Google 캘린더 | 반복 운동 일정 등록 + 알림 + 자동 웹캠 활성화 |

## 기술 스택

**Frontend**: Next.js 15, TypeScript, TailwindCSS, TensorFlow.js (MoveNet), Socket.io-client  
**Backend**: FastAPI, Python 3.11+, ChromaDB (RAG), Google Calendar API  
**LLM**: Upstage Solar (기본) / OpenAI / Anthropic Claude / Ollama (로컬) — `.env`로 전환 가능  
**DB**: SQLite

## 빠른 시작

### 1. 환경 변수 설정

`backend/.env` 파일 생성:

```env
# LLM 제공자 선택 (기본: upstage)
LLM_PROVIDER=upstage        # upstage | openai | anthropic | ollama
EMBED_PROVIDER=upstage      # upstage | openai | local

# 선택한 제공자의 API 키만 입력
UPSTAGE_API_KEY=up_xxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx

# Google Calendar (선택)
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_secret

# 기타
FRONTEND_URL=http://localhost:3000
```

LLM 제공자별 기본 모델:

| LLM_PROVIDER | 기본 모델 | API 키 필요 |
|---|---|---|
| `upstage` | solar-pro | UPSTAGE_API_KEY |
| `openai` | gpt-4o-mini | OPENAI_API_KEY |
| `anthropic` | claude-haiku-4-5 | ANTHROPIC_API_KEY |
| `ollama` | llama3.2 | 불필요 (로컬 실행) |

`LLM_MODEL` 환경 변수로 모델을 직접 지정할 수도 있습니다.

### 2. 설치 및 실행

```
setup.bat 더블클릭  # 최초 1회 — 의존성 설치
start.bat 더블클릭  # 서버 시작
```

→ http://localhost:3000 자동 오픈

## 폴더 구조

```
solarsystem/
├── backend/                        # FastAPI 서버 (포트 8000)
│   ├── main.py                     # 앱 진입점 + Socket.IO 이벤트
│   ├── database.py                 # SQLite 초기화
│   ├── routers/
│   │   ├── pose.py                 # 자세 분석 + LLM 피드백
│   │   ├── workout.py              # 운동 루틴 생성
│   │   ├── chat.py                 # AI 코치 챗봇
│   │   ├── battle.py              # 대결 매칭
│   │   └── calendar_router.py     # Google Calendar
│   ├── services/
│   │   ├── llm_provider.py        # LLM 멀티 제공자 추상화
│   │   ├── rag_service.py         # ChromaDB RAG
│   │   ├── upstage_service.py     # Upstage 전용 기능
│   │   └── matching_service.py    # 유사도 매칭
│   └── data/exercises.json        # 운동 지식 베이스
└── frontend/                       # Next.js 앱 (포트 3000)
    └── src/
        ├── app/                    # Next.js App Router 페이지
        ├── components/
        │   ├── PoseDetector.tsx    # 웹캠 + AI 자세 분석
        │   ├── WorkoutVideo.tsx    # AI 루틴 영상
        │   ├── CoachVideo.tsx      # 코치 영상
        │   ├── Chatbot.tsx         # AI 코치 채팅
        │   ├── BattleArena.tsx     # 대결 UI
        │   ├── CalendarView.tsx    # 일정 관리
        │   ├── Navbar.tsx          # 상단 네비게이션
        │   └── Sidebar.tsx         # 사이드바
        ├── hooks/
        │   ├── usePoseDetection.ts # TensorFlow.js 포즈 감지
        │   └── useSocket.ts        # 실시간 대결 WebSocket
        └── lib/
            ├── poseAnalysis.ts     # 관절 각도 계산 + 교정
            └── api.ts              # 백엔드 API 클라이언트
```

## 아키텍처 흐름

```
[웹캠] → [TensorFlow.js MoveNet] → [관절 각도 계산]
                                           ↓
                              [자세 교정 피드백 (즉시)]
                                           ↓
                         [LLM Provider + ChromaDB RAG]
                                           ↓
                     [챗봇 증상 데이터 있음?]
                    YES ↙                 ↘ NO
              [컨텍스트 합산]          [자세 데이터만]
                         ↓
              [맞춤 운동 루틴 생성]
                         ↓
              [Google Calendar 등록]
                         ↓
              [유사 유저 대결 매칭 (Socket.IO)]
```
