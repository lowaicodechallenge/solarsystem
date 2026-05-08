# FitAI - AI 피트니스 코치

웹캠 + AI 자세 분석 기반 맞춤형 홈 트레이닝 서비스

## 주요 기능

| 기능 | 설명 |
|------|------|
| 🎯 실시간 자세 분석 | MediaPipe + TensorFlow.js로 웹캠에서 즉시 자세 교정 피드백 |
| 🤖 AI 운동 루틴 | Upstage Solar LLM이 자세 분석 + 증상 기반 맞춤 루틴 생성 |
| 📚 RAG 재활 운동 | ChromaDB 벡터 DB에서 증상/자세 맞는 운동을 검색해 추천 |
| 💬 AI 코치 챗봇 | 증상 입력 → LLM이 문맥 파악 → 자세 분석과 통합 처리 |
| ⚔️ 실시간 대결 | 유사 자세 문제 사용자와 WebSocket 기반 60초 운동 배틀 |
| 📅 Google 캘린더 | 반복 운동 일정 등록 + 알림 + 자동 웹캠 활성화 |

## 기술 스택

**Frontend**: Next.js 14, TypeScript, TailwindCSS, TensorFlow.js (MoveNet), Socket.io
**Backend**: FastAPI, Python 3.11+, ChromaDB (RAG), Upstage Solar API, Google Calendar API
**DB**: SQLite (기본), PostgreSQL 전환 가능

## 빠른 시작

### 1. API 키 발급
- [Upstage Console](https://console.upstage.ai/) → API Key 발급
- [Google Cloud Console](https://console.cloud.google.com/) → Calendar API 활성화 + OAuth 2.0 자격증명 생성

### 2. 설치
```
setup.bat 더블클릭
```

### 3. 환경 변수 설정
`backend/.env` 편집:
```
UPSTAGE_API_KEY=up_xxxxxxxxxxxxxxxx
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_secret
```

### 4. 실행
```
start.bat 더블클릭
```
→ http://localhost:3000 자동 오픈

## 폴더 구조

```
fitness-ai/
├── backend/                  # FastAPI 서버
│   ├── main.py               # 앱 진입점 + Socket.IO
│   ├── routers/
│   │   ├── pose.py           # 자세 분석 + LLM 피드백
│   │   ├── workout.py        # 운동 루틴 생성
│   │   ├── chat.py           # AI 코치 챗봇
│   │   ├── battle.py         # 대결 매칭
│   │   └── calendar_router.py # Google Calendar
│   ├── services/
│   │   ├── upstage_service.py # Solar LLM 연동
│   │   ├── rag_service.py    # ChromaDB RAG
│   │   └── matching_service.py # 유사도 매칭
│   └── data/exercises.json   # 운동 지식 베이스
└── frontend/                 # Next.js 앱
    └── src/
        ├── components/
        │   ├── PoseDetector.tsx    # 웹캠 + AI 자세 분석
        │   ├── WorkoutVideo.tsx    # AI 루틴 + 유튜브 연동
        │   ├── Chatbot.tsx         # AI 코치 채팅
        │   ├── BattleArena.tsx     # 대결 UI
        │   └── CalendarView.tsx    # 일정 관리
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
                         [Upstage Solar LLM + RAG 분석]
                                           ↓
                     [챗봇 증상 데이터 있음?]
                    YES ↙                 ↘ NO
              [컨텍스트 합산]          [자세 데이터만]
                         ↓
              [맞춤 운동 루틴 생성]
                         ↓
              [YouTube 영상 추천]
                         ↓
              [Google Calendar 등록]
                         ↓
              [유사 유저 대결 매칭]
```
