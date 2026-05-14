"""
Thin wrappers that build prompts and call the active LLM provider.
Switch providers via LLM_PROVIDER env var — see llm_provider.py.
"""
from services.llm_provider import chat
import json


async def call_solar(
    messages: list[dict],
    system_prompt: str = "",
    temperature: float = 0.7,
    max_tokens: int = 1500,
) -> str:
    return await chat(messages, system_prompt, temperature, max_tokens)


async def analyze_posture_with_llm(
    exercise_type: str,
    keypoints: dict,
    angles: dict,
    score: float,
    symptoms: str = "",
) -> dict:
    system_prompt = """당신은 전문 물리치료사이자 개인 트레이너입니다.
사용자의 운동 자세를 분석하고 한국어로 구체적이고 친절한 피드백을 제공하세요.
피드백은 실시간으로 제공되므로 간결하고 명확하게 작성하세요."""

    symptoms_context = f"\n\n사용자 증상/불편사항: {symptoms}" if symptoms else ""

    user_message = f"""운동 종류: {exercise_type}
현재 자세 점수: {score:.0f}/100
관절 각도 분석:
{chr(10).join([f"- {k}: {v:.1f}°" for k, v in angles.items()])}
{symptoms_context}

위 데이터를 기반으로 다음을 JSON 형식으로 반환하세요:
{{
  "main_correction": "가장 중요한 교정 포인트 1개 (30자 이내)",
  "corrections": ["교정사항1", "교정사항2", "교정사항3"],
  "encouragement": "격려 메시지 (20자 이내)",
  "risk_warning": "주의사항 (있으면 작성, 없으면 null)"
}}"""

    try:
        result = await chat(
            [{"role": "user", "content": user_message}],
            system_prompt=system_prompt,
            temperature=0.3,
        )
        start = result.find("{")
        end = result.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(result[start:end])
    except Exception:
        pass
    return {
        "main_correction": "자세를 유지하세요",
        "corrections": ["균형 있는 자세를 유지하세요"],
        "encouragement": "잘 하고 있어요!",
        "risk_warning": None,
    }


async def generate_workout_routine(
    pose_analysis: dict,
    symptoms: str,
    rag_exercises: list[dict],
    user_history: list[dict],
) -> dict:
    system_prompt = """당신은 개인 맞춤형 운동 처방 전문가입니다.
사용자의 자세 분석 결과, 증상, 추천 운동을 바탕으로 오늘의 맞춤 운동 루틴을 설계합니다.
반드시 한국어로 답변하고, 의학적으로 안전하고 효과적인 루틴을 제공하세요."""

    history_summary = ""
    if user_history:
        recent = user_history[:3]
        history_summary = f"\n최근 운동 기록: {', '.join([h.get('exercise_type', '') for h in recent])}"

    exercises_text = "\n".join([
        f"- {ex['name']}: {ex['description']}" for ex in rag_exercises[:5]
    ])

    user_message = f"""자세 분석 결과:
{pose_analysis.get('summary', '분석 데이터 없음')}

사용자 증상/불편사항: {symptoms if symptoms else '없음'}

추천 가능한 운동 목록:
{exercises_text}
{history_summary}

위 정보를 바탕으로 다음 JSON 형식의 오늘의 운동 루틴을 만들어주세요:
{{
  "routine_name": "오늘의 루틴 이름",
  "focus_area": "집중 부위",
  "total_minutes": 숫자,
  "warm_up": ["워밍업 동작1", "워밍업 동작2"],
  "main_exercises": [
    {{
      "name": "운동명",
      "sets": 숫자,
      "reps": "횟수 또는 시간",
      "rest_seconds": 숫자,
      "key_point": "핵심 포인트"
    }}
  ],
  "cool_down": ["쿨다운 동작1", "쿨다운 동작2"],
  "personalized_note": "사용자에게 맞춤 한마디"
}}"""

    try:
        result = await chat(
            [{"role": "user", "content": user_message}],
            system_prompt=system_prompt,
            temperature=0.5,
        )
        start = result.find("{")
        end = result.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(result[start:end])
    except Exception:
        pass

    return {
        "routine_name": "기본 운동 루틴",
        "focus_area": "전신",
        "total_minutes": 30,
        "warm_up": ["제자리 걷기 2분", "팔 돌리기"],
        "main_exercises": [
            {
                "name": "스쿼트",
                "sets": 3,
                "reps": "12회",
                "rest_seconds": 60,
                "key_point": "무릎이 발끝을 넘지 않도록",
            }
        ],
        "cool_down": ["스트레칭 5분"],
        "personalized_note": "오늘도 수고하셨습니다!",
    }


async def analyze_current_state(
    posture_issues: list[str],
    front_score: float,
    side_score: float,
    symptoms: str,
    doc_text: str,
    rag_exercises: list[dict],
) -> dict:
    system_prompt = """당신은 전문 물리치료사이자 개인 트레이너입니다.
사용자의 자세 분석 결과, 증상, 임상 자료를 종합하여 현재 신체 상태를 평가하고 적합한 운동을 추천합니다.
반드시 한국어로 답변하세요."""

    issues_text = "\n".join([f"- {i}" for i in posture_issues]) if posture_issues else "- 없음"
    doc_section = f"\n\n임상 자료 내용:\n{doc_text[:1500]}" if doc_text else ""
    exercises_text = "\n".join([f"- {ex['name']}: {ex['description']}" for ex in rag_exercises[:4]])

    user_message = f"""다음 정보를 바탕으로 사용자의 현재 신체 상태를 분석하고 운동을 추천해주세요.

## 자세 분석 결과
정면 점수: {front_score:.0f}/100
측면 점수: {side_score:.0f}/100
발견된 자세 문제:
{issues_text}

## 증상/불편사항
{symptoms if symptoms else "없음"}
{doc_section}

## 추천 가능한 운동
{exercises_text}

반드시 아래 JSON 형식으로만 응답하세요:
{{
  "state_summary": "현재 신체 상태 요약 2~3문장",
  "main_concerns": ["주요 우려사항1", "주요 우려사항2"],
  "risk_areas": ["주의 부위1"],
  "recommendation_note": "운동 추천 이유 1~2문장",
  "exercise_reasons": {{
    "운동명": "이 운동을 추천하는 이유 (1문장)"
  }}
}}"""

    try:
        result = await chat(
            [{"role": "user", "content": user_message}],
            system_prompt=system_prompt,
            temperature=0.4,
            max_tokens=1200,
        )
        start = result.find("{")
        end = result.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(result[start:end])
    except Exception:
        pass

    return {
        "state_summary": "자세 분석 결과를 바탕으로 맞춤 운동을 추천해드립니다.",
        "main_concerns": posture_issues[:2] if posture_issues else ["자세 데이터가 없습니다"],
        "risk_areas": [],
        "recommendation_note": "아래 운동들을 통해 자세를 교정하고 건강을 개선하세요.",
        "exercise_reasons": {},
    }
