# 솔메이트 - AI 피트니스 코치

사진 업로드 + AI 자세 분석 기반 맞춤형 홈 트레이닝 서비스 (웹캠 실시간 분석 병행 지원)

## 주요 기능

| 기능 | 설명 |
|------|------|
| 사진 기반 자세 분석 | 정면·측면 사진을 업로드하면 MediaPipe가 랜드마크를 시각화하고 자세 점수 산출 (웹캠 대체 분석도 지원) |
| 인바디 기반 운동 추천 | 인바디 결과지를 AI가 읽어 체성분 데이터 기반 맞춤 운동 추천 |
| AI 상태 분석 | 자세 점수·증상·인바디 데이터를 보유 상태에 따라 4가지 모드로 분기해 LLM이 현재 신체 상태 요약 |
| 국민체력100 영상 추천 | AI 분석 결과 기반으로 교정/재활 필요 부위 영상 자동 선택 (부상 부위 제외) |
| 주간 리포트 | 운동 기록·자세 점수·증상을 종합한 주간 AI 리포트 생성. Google Calendar 연동 시 캘린더 이벤트 수도 합산해 집계 |
| 리포트 메일 발송 | 생성된 주간 리포트를 HTML 이메일로 발송 (SMTP 설정 필요) |
| RAG 운동 DB | ChromaDB 벡터 DB에서 증상/자세에 맞는 운동 검색 |
| AI 코치 챗봇 | 증상 입력 → LLM 문맥 파악 → 자세 분석과 통합 처리 |
| 실시간 대결 | 유사 자세 문제 사용자와 WebSocket 기반 60초 운동 배틀 (WIP — 백엔드·컴포넌트 구현됨) |
| Google 캘린더 | 프론트 전용 OAuth → When2Meet 그리드로 빈 시간대 탐색 후 운동 블록 등록 |
| Dashboard | Google Calendar 연동 시 예정/완료 운동 일정 자동 표시 |

## 기술 스택

**Frontend**: Next.js 15, TypeScript, TailwindCSS, MediaPipe PoseLandmarker, Socket.io-client, @react-oauth/google  
**Backend**: FastAPI, Python 3.11+, ChromaDB (RAG)  
**LLM**: Upstage Solar API (solar-pro)  
**Document AI**: Upstage Document Parse / Document Classify / Information Extract  
**DB**: SQLite

## 빠른 시작

### 1. 환경 변수 설정

`backend/.env` 파일 생성:

```env
UPSTAGE_API_KEY=up_xxxxxxxxxxxxxxxx

# 국민체력100 동영상 API
NFA_API_KEY=your_nfa_api_key_here

# YouTube (선택 — 없으면 검색 링크로 대체)
VIDEO_API_KEY=your_youtube_data_api_v3_key

FRONTEND_URL=http://localhost:3000

# 주간 리포트 메일 발송 (선택 — 없으면 메일 발송 기능 비활성화)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your_app_password   # Gmail: 앱 비밀번호 16자리 (2단계 인증 필요)
```

`frontend/.env.local` 파일 생성:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
# Google Calendar OAuth (Client Secret 불필요 — 프론트 전용 token flow)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
```

### 2. 설치 및 실행

```
setup.bat 더블클릭  # 최초 1회 — 의존성 설치
start.bat 더블클릭  # 서버 시작
```

→ http://localhost:3000 자동 오픈

## 문서 처리 파이프라인

인바디 결과지(PDF, 이미지)를 업로드하면 다음 4단계를 자동 처리합니다.

```
업로드된 파일
    │
    ▼
[1] Document Classify  →  인바디 / 기타
    │
    ▼ (병렬)
[2] Document Parse      →  표·문단 구조화 텍스트 추출
[3] Information Extract →  인바디 스키마로 체성분 데이터 JSON 추출
    │
    ▼
[4] 후처리
    ├─ PII 제거 — parsed_text(원문) + health_info(구조화 데이터) 모두 적용
    │    · 이름      성명/환자명 라벨 뒤 2~4자 한국어 이름
    │    · 주민번호  XXXXXX-XXXXXXX 형식
    │    · 전화번호  010-XXXX-XXXX 등
    │    · 병원명    XX병원 / XX의원 / XX한의원 등
    │    · 주소      행정구역명으로 시작하는 상세 주소, 주소: 라벨 뒤 전체
    ├─ 단위 통일 (cm / kg / % / mmHg)
    └─ 위험 태그 변환
         예) "무릎 통증"  → avoid_jump
             "고혈압"    → avoid_high_intensity
             "허리 통증" → avoid_spinal_flexion_load
```

인바디 추출 스키마:

| 필드 | 설명 | 비고 |
|------|------|------|
| weight_kg | 체중 (kg) | 공통 |
| skeletal_muscle_mass_kg | 골격근량 (kg) | 공통 |
| body_fat_mass_kg | 체지방량 (kg) | 공통 |
| body_fat_percentage | 체지방률 (%) | 공통 |
| bmi | BMI | 공통 |
| inbody_score | 인바디 점수 | 기종별 선택 |
| visceral_fat_level | 내장지방 레벨 | 기종별 선택 |
| basal_metabolic_rate_kcal | 기초대사량 (kcal) | 기종별 선택 |
| segmental_muscle_balance | 부위별 근육량 (왼팔·오른팔·몸통·왼다리·오른다리) | 고급 기종 전용 |

## 자세 스코어링 (v2)

100점 만점에서 감점하는 방식으로 자세 점수를 산출합니다.  
캡처 시 마지막 1.5초(약 45프레임)의 점수 평균을 최종 점수로 사용합니다.  
**측면 촬영 시 사용자의 오른쪽이 카메라에 찍히도록 서야 합니다** (무릎 과신전·골반 경사 cross 부호 기준).

| # | 항목 | 측정 기준 | 적용 뷰 | 최대 감점 |
|---|------|-----------|---------|-----------|
| 1 | 거북목 | 귀-어깨 수직 각도 AND z축 깊이 (AND 조건, 3단계 누적) | 공통 | -20점 |
| 2 | 머리 기울기 | 좌우 귀 높이 차 / 어깨 너비 | 정면 전용 | -7점 |
| 3 | 어깨 말림 | 어깨-귀 z축 깊이 차 + x축 간격 비율 | 측면 전용 | -10점 |
| 4 | 어깨 비대칭 | 좌우 어깨 높이 차 / 어깨 너비 | 정면 전용 | -7점 |
| 5 | 골반 기울기 | 좌우 골반 높이 차 / 어깨 너비 | 정면 전용 | -10점 |
| 6 | 골반 전방 변위 | 골반 z축 돌출 (어깨·발목 평균 대비) | 측면 전용 | -13점 |
| 7 | 골반 경사 | 어깨-골반-무릎 내각 + 2D 외적으로 전방/후방 판별 | 측면 전용 | -7점 |
| 8 | 무릎 과신전 | 골반-무릎-발목 내각 + 2D 외적으로 후방 꺾임 판별 | 측면 전용 | -7점 |
| 9 | 몸통 측방 이탈 | 어깨·골반 중앙의 발목 기준 x축 이탈 비율 | 정면 전용 | -7점 |

정면 최대 감점 **-51점** / 측면 최대 감점 **-57점**

상세 임계값 및 계산 방식 → [`src/POSE_SCORING.md`](frontend/src/POSE_SCORING.md)

## AI 상태 분석 모드 (analysis_mode)

`POST /api/workout/recommend`는 보유 데이터에 따라 LLM 시스템 프롬프트를 자동 분기합니다.

| 모드 | 조건 | LLM 지시 | 프론트 배지 |
|------|------|-----------|------------|
| `full` | 자세 분석 + 인바디 문서 모두 있음 | 종합 분석 | 📊 종합 분석 기반 추천 |
| `doc_only` | 인바디 문서만 있음 | 문서 기반으로만 추천 | 📄 건강 문서 기반 추천 |
| `pose_only` | 자세 분석만 있음 | 자세 기반으로만 추천 | 🧍 자세 분석 기반 추천 |
| `general` | 데이터 없음 | 일반 자세 교정 추천 | 💡 일반 추천 |

> **최소 입력 조건**: 자세 분석 결과 또는 인바디 문서 중 최소 하나가 있어야 AI 분석 버튼이 활성화됩니다.

## AI 안전 가이드라인

LLM 프롬프트 및 UI 전반에 다음 의료 면책 원칙을 적용합니다.

| 적용 위치 | 내용 |
|-----------|------|
| LLM 시스템 프롬프트 (운동 추천·자세 분석) | 권장형 표현 강제 ('~권장합니다', '~도움이 될 수 있습니다'), 단정적 진단 표현 금지, 통증 시 즉시 중단 권고 명시 |
| LLM 시스템 프롬프트 (자세 교정 피드백) | 교정 피드백은 권장형으로만 작성, 의학적 처방처럼 들리는 표현 사용 금지 |
| AI 코치 챗봇 UI | "AI 코치는 참고용입니다. 통증이 있다면 의료 전문가와 상담하세요." 배너 상시 표시 |
| 운동 루틴 UI | "본 추천은 참고용이며 의료적 처방을 대체하지 않습니다. 통증 발생 시 즉시 중단하고 전문가와 상담하세요." 배너 표시 |
| 자세 스캔 결과 UI | 하단 면책 문구 표시 |

## 운동 영상 추천 (국민체력100 API)

`POST /api/workout/nfa-videos` — AI 분석 결과 기반 맞춤 영상 추천

### 흐름

AI 상태 분석 → 분석 결과를 기반으로 NFA 영상 검색 (순차 실행)

```
[AI 상태 분석]  POST /api/workout/recommend
  자세 이슈 + 증상 + 인바디 데이터 → state_summary, main_concerns, risk_areas, analysis_mode 반환
       │
       ▼  main_concerns + risk_areas → goal로 전달
[NFA 영상 선택]  POST /api/workout/nfa-videos
  _classify_for_nfa(goal) — LLM이 각 문제를 분류:
    ├─ 교정/강화/재활 필요 → target_parts (운동 추천)
    └─ 급성 부상/염증/관절염 → 제외 (운동 금지)
       │
       ▼  target_parts별 병렬 호출
  MSCL API (trng_part_nm 필터)  +  PRSC API (trng_plc_nm 필터)
  dedup → 정규화 → max_results 반환
```

예시: AI 분석 결과 "거북목, 골반 비대칭, 무릎 관절염"
- `target_parts = ["어깨", "허리"]` (무릎 관절염 → 급성 판단, 제외)
- MSCL 어깨 + MSCL 허리 + PRSC 실내 병렬 호출 → 8개 반환

### MSCL API 유효 필터값

MSCL DB에 실제 데이터가 있는 `trng_part_nm` 값은 세 가지뿐입니다.

| trng_part_nm | 영상 수 | 해당 증상 |
|---|---|---|
| 어깨 | 202개 | 거북목, 어깨 말림, 목/어깨 통증 |
| 허리 | 210개 | 골반 비대칭, 요통, 척추 측만, 코어 약화 |
| 무릎 | 259개 | 무릎 통증(만성·재활), 하체 근력 약화 |

> `aggrp_nm=성인` 필터는 DB 데이터 대부분이 `공통` 분류라 결과 0개 반환 — 사용 안 함

## Dashboard — 인바디 연동 흐름

Dashboard에서 처리한 인바디 결과지는 **운동 시작** 페이지까지 자동으로 이어집니다.

```
[Dashboard] 인바디 결과지 업로드 + SAVE DATA
    │
    ▼
문서 처리 파이프라인 (Classify → Parse → Extract → PII 제거)
    │
    ▼
localStorage("fitai_health_documents")  ← 최대 10개 배열로 누적 저장
    │
    ▼
[운동 시작] 페이지 진입 시 자동 로드
    ├─ "Dashboard에서 불러온 문서" 배지로 표시
    ├─ 초기화 버튼으로 제거 가능
    └─ AI 분석 시 health_info + risk_tags + doc_text로 통합 전달
         → analysis_mode = "full" 또는 "doc_only" 로 분기
```

> 증상(fitai_symptoms), 자세 분석(fitai_posture_analysis)도 동일하게 localStorage를 통해 이어집니다.

## Dashboard — Google Calendar 연동

Google Calendar를 연동하면 Dashboard 카드가 자동으로 업데이트됩니다.

```
gcal_access_token (localStorage)
    │
    ├─► 예정된 운동 카드
    │     Google Calendar API 직접 조회 (q="솔메이트", timeMin=now)
    │     날짜 · 요일 · 시간 표시
    │
    └─► 최근 운동 기록 카드
          과거 이벤트 조회 (timeMax=now, 최근 1년)
          가장 최근 완료 이벤트 1개 표시
          하단: 총 N회 운동 완료
```

Google Calendar 미연동 시 기존 SQLite 기반 데이터로 fallback.

주간 리포트 페이지에서도 동일한 토큰으로 최근 7일(현재 날짜 기준 -6일 00:00 ~ 현재)의 솔메이트 이벤트 수를 조회해 `gcal_session_count`로 백엔드에 전달합니다. 리포트 운동 횟수 집계는 SQLite 세션 수 + GCal 이벤트 수의 합산값입니다.

## API 엔드포인트

### 문서 처리
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/workout/process-document` | 풀파이프라인 (Classify → Parse → Extract → 후처리) |
| POST | `/api/workout/ocr` | 단순 텍스트 추출 (Document Parse만) |

### 운동 추천
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/workout/recommend` | AI 상태 분석 → `analysis`, `analysis_mode`, `exercises` 반환 |
| POST | `/api/workout/nfa-videos` | 분석 결과 기반 국민체력100 영상 추천 |
| POST | `/api/workout/routine` | 맞춤 운동 루틴 생성 |
| GET  | `/api/workout/nfa-test` | NFA API 연결 테스트 |

### 자세 분석
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/pose/analyze` | 자세 분석 + LLM 피드백 |
| POST | `/api/pose/session/save` | 세션 저장 |
| GET  | `/api/pose/history/{user_id}` | 운동 기록 조회 |

### 리포트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/report/weekly` | 주간 운동 기록·자세 점수·증상 종합 리포트 생성 (`gcal_session_count` 포함 시 GCal 이벤트 수 합산) |
| POST | `/api/report/send-email` | 생성된 리포트를 HTML 이메일로 발송 |

### 기타
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/chat/message` | AI 코치 챗봇 |
| POST | `/api/battle/join` | 대결 매칭 (WIP) |
| POST | `/api/battle/score` | 대결 점수 업데이트 (WIP) |
| POST | `/api/battle/end/{battle_id}` | 대결 종료 (WIP) |
| DELETE | `/api/battle/leave/{user_id}` | 대결 퇴장 (WIP) |
| GET  | `/api/calendar/upcoming/{user_id}` | 예정 운동 조회 (SQLite fallback용) |

## 폴더 구조

```
solarsystem/
├── backend/                        # FastAPI 서버 (포트 8000)
│   ├── main.py                     # 앱 진입점 + Socket.IO 이벤트
│   ├── database.py                 # SQLite 초기화
│   ├── routers/
│   │   ├── pose.py                 # 자세 분석 + LLM 피드백
│   │   ├── workout.py              # 문서 처리 파이프라인 + 운동/NFA 영상 추천
│   │   ├── report.py               # 주간 리포트 생성
│   │   ├── chat.py                 # AI 코치 챗봇
│   │   ├── battle.py               # 대결 매칭 (WIP)
│   │   └── calendar_router.py      # 일정 관리 (SQLite)
│   ├── services/
│   │   ├── upstage_service.py      # Document AI + LLM 프롬프트 (analyze_current_state 등)
│   │   ├── llm_provider.py         # LLM 멀티 제공자 추상화
│   │   ├── rag_service.py          # ChromaDB RAG (운동 지식 베이스)
│   │   ├── nfa_video_service.py    # 국민체력100 API 연동 + 분류/추천 파이프라인
│   │   └── matching_service.py     # 유사도 매칭
│   └── data/exercises.json         # 운동 지식 베이스 (RAG 시드 데이터)
└── frontend/                       # Next.js 앱 (포트 3000)
    └── src/
        ├── POSE_SCORING.md         # 자세 스코어링 로직 상세 문서 (v2)
        ├── app/
        │   ├── page.tsx            # Dashboard (운동 기록 + 예정 일정 + 증상 입력)
        │   ├── exercise/page.tsx   # AI 상태 분석 + 국민체력100 영상 추천 (최소 입력 1개 필수)
        │   ├── report/page.tsx     # 주간 리포트
        │   ├── scanpose/           # 자세 스캔 세션
        │   │   ├── page.tsx        # 스캔 홈 (이전 분석 결과 + 재스캔 진입)
        │   │   └── scan/page.tsx   # 사진 업로드·분석 + 웹캠 대체 분석
        │   └── calendar/page.tsx   # Google Calendar 연동
        ├── components/
        │   ├── PoseDetector.tsx    # 웹캠 실시간 자세 분석 컴포넌트
        │   ├── WorkoutVideo.tsx    # 맞춤 운동 루틴 UI
        │   ├── CoachVideo.tsx      # 코치 영상 UI (WIP)
        │   ├── CalendarView.tsx    # Google Calendar OAuth + When2Meet 그리드
        │   ├── Chatbot.tsx         # AI 코치 채팅
        │   ├── BattleArena.tsx     # 대결 UI (WIP)
        │   └── Sidebar.tsx         # 사이드바 네비게이션
        ├── hooks/
        │   ├── usePoseDetection.ts # MediaPipe 포즈 감지 (VIDEO 모드)
        │   └── useSocket.ts        # 실시간 대결 WebSocket
        └── lib/
            ├── api.ts              # 백엔드 API 클라이언트 + 타입 정의
            ├── poseAnalysis.ts     # 관절 각도 계산 + 자세 스코어링 v2
            └── utils.ts            # 공통 유틸리티
```

## 아키텍처 흐름

```
[정면·측면 사진 업로드] ──► [MediaPipe PoseLandmarker (IMAGE 모드)] → [자세 스코어링 v2]
[웹캠 실시간 (선택)]    ──►         (VIDEO 모드)
                                                │
                                    [자세 교정 피드백 (즉시)]
                                                │
[인바디 결과지 업로드]                           │
    │                                           │
    ▼                                           ▼
[Document Classify]               [1] AI 상태 분석 (LLM + ChromaDB RAG)
[Document Parse   ]  ──────────►       analysis_mode 분기 (full/doc_only/pose_only/general)
[Information Extract]                  state_summary / main_concerns / risk_areas 반환
[PII 제거·위험 태그]                             │
                                                ▼
                               [2] NFA 영상 분류 (LLM)
                                    교정/재활 → target_parts
                                    급성 부상  → 제외
                                                │
                               [3] 부위별 MSCL + PRSC 병렬 호출
                                                │
                               [4] 맞춤 운동 영상 8개 반환
                                                │
                         [Google Calendar 일정 등록 (프론트 직접 호출)]
                                                │
                         [주간 리포트 생성 (POST /api/report/weekly)]
```
