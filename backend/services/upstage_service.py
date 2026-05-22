"""
Thin wrappers that build prompts and call the active LLM provider.
Switch providers via LLM_PROVIDER env var — see llm_provider.py.
"""
from services.llm_provider import chat
import json
import base64
import os
import re
import httpx

UPSTAGE_BASE = "https://api.upstage.ai/v1"

def _upstage_key(service: str = "llm") -> str:
    """서비스별 키 조회. 전용 키 없으면 UPSTAGE_API_KEY로 fallback."""
    specific = {
        "llm":      "UPSTAGE_LLM_KEY",
        "parse":    "UPSTAGE_PARSE_KEY",
        "classify": "UPSTAGE_CLASSIFY_KEY",
        "extract":  "UPSTAGE_EXTRACT_KEY",
    }
    env_var = specific.get(service, "UPSTAGE_API_KEY")
    return os.getenv(env_var) or os.getenv("UPSTAGE_API_KEY", "")


# ── PII 제거 패턴 ─────────────────────────────────────────────────────────────
_PII_PATTERNS = [
    # 주민등록번호
    (r"\d{6}-[1-4]\d{6}", "[주민번호 제거]"),
    # 전화번호
    (r"0\d{1,2}[-)\s]\d{3,4}[-\s]\d{4}", "[전화번호 제거]"),
    (r"\d{3}-\d{4}-\d{4}", "[전화번호 제거]"),
    # 이름 (성명/환자명 라벨 뒤에 오는 2~4자 한국어 이름)
    (r"(이름|성명|환자명|환자\s*성명)\s*[:：]\s*[가-힣]{2,4}", r"\1: [이름 제거]"),
    # 병원명 (XX병원/의원/한의원/클리닉)
    (r"[가-힣a-zA-Z0-9]{2,15}(병원|의원|한의원|클리닉|의료원|보건소|재활센터)", "[병원명 제거]"),
    # 주소 — 라벨 뒤 전체 줄
    (r"(주소|거주지|소재지|자택주소)\s*[:：]\s*[^\n]{5,100}", r"\1: [주소 제거]"),
    # 주소 — 행정구역으로 시작하는 상세 주소
    (r"(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주특별자치도)[가-힣\s\d\-·,]+?(로|길|동|번지)\s*\d*", "[주소 제거]"),
]

# ── 위험 태그 매핑 ─────────────────────────────────────────────────────────────
_RISK_TAG_MAP = {
    "고혈압": "avoid_high_intensity",
    "혈압":   "avoid_high_intensity",
    "심장":   "avoid_high_intensity",
    "무릎":   "avoid_jump",
    "슬관절": "avoid_jump",
    "허리":   "avoid_spinal_flexion_load",
    "요통":   "avoid_spinal_flexion_load",
    "척추":   "avoid_spinal_flexion_load",
    "골다공증": "avoid_impact",
    "당뇨":   "monitor_blood_sugar",
    "천식":   "monitor_breathing",
    "어깨":   "avoid_overhead",
}

# ── 인바디 체성분 Information Extract 스키마 ──────────────────────────────────
_BODY_COMPOSITION_SCHEMA = {
    "type": "object",
    "properties": {
        # 핵심 필드 — 모든 인바디 기종에 공통
        "weight_kg":               {"type": ["number", "null"], "description": "체중 (kg)"},
        "skeletal_muscle_mass_kg": {"type": ["number", "null"], "description": "골격근량 (kg)"},
        "body_fat_mass_kg":        {"type": ["number", "null"], "description": "체지방량 (kg)"},
        "body_fat_percentage":     {"type": ["number", "null"], "description": "체지방률 (%)"},
        "bmi":                     {"type": ["number", "null"], "description": "BMI"},
        # 기종별로 있을 수도 없을 수도 있는 필드
        "inbody_score":             {"type": ["number", "null"], "description": "인바디 점수 (없으면 null)"},
        "visceral_fat_level":       {"type": ["number", "null"], "description": "내장지방 레벨 (없으면 null)"},
        "basal_metabolic_rate_kcal":{"type": ["number", "null"], "description": "기초대사량 kcal (없으면 null)"},
        # 부위별 근육 균형 — 고급 기종만
        "segmental_muscle_balance": {
            "type": "object",
            "description": "부위별 근육량. 측정 안 된 부위는 null",
            "properties": {
                "left_arm":  {"type": ["number", "null"]},
                "right_arm": {"type": ["number", "null"]},
                "trunk":     {"type": ["number", "null"]},
                "left_leg":  {"type": ["number", "null"]},
                "right_leg": {"type": ["number", "null"]},
            },
        },
    },
}

_EXTRACT_SCHEMAS: dict[str, dict] = {
    "inbody": {
        "type": "object",
        "properties": {
            "body_composition": _BODY_COMPOSITION_SCHEMA,
        },
        "required": [],
    },
}


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
피드백은 간결하고 명확하게 작성하세요.

[필수 준수 사항]
1. 교정 피드백은 '~해보세요', '~을 권장합니다' 등 권장형으로만 작성하세요.
2. 통증이 언급된 경우 즉시 중단을 권고하세요.
3. 의학적 진단이나 처방처럼 들리는 표현은 사용하지 마세요."""

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


def _format_health_info_for_llm(health_info: dict) -> str:
    lines: list[str] = []

    body = health_info.get("body_composition") or {}
    if any(v for v in body.values() if v is not None):
        lines.append("[체성분 (인바디)]")
        if body.get("weight_kg") is not None:               lines.append(f"- 체중: {body['weight_kg']}kg")
        if body.get("skeletal_muscle_mass_kg") is not None: lines.append(f"- 골격근량: {body['skeletal_muscle_mass_kg']}kg")
        if body.get("body_fat_mass_kg") is not None:        lines.append(f"- 체지방량: {body['body_fat_mass_kg']}kg")
        if body.get("body_fat_percentage") is not None:     lines.append(f"- 체지방률: {body['body_fat_percentage']}%")
        if body.get("bmi") is not None:                     lines.append(f"- BMI: {body['bmi']}")
        if body.get("inbody_score") is not None:            lines.append(f"- 인바디 점수: {body['inbody_score']}")
        if body.get("visceral_fat_level") is not None:      lines.append(f"- 내장지방 레벨: {body['visceral_fat_level']}")
        if body.get("basal_metabolic_rate_kcal") is not None: lines.append(f"- 기초대사량: {body['basal_metabolic_rate_kcal']}kcal")
        seg = body.get("segmental_muscle_balance") or {}
        seg_vals = {k: v for k, v in seg.items() if v is not None}
        if seg_vals:
            lines.append("- 부위별 근육량:")
            label_map = {"left_arm": "왼팔", "right_arm": "오른팔", "trunk": "몸통", "left_leg": "왼다리", "right_leg": "오른다리"}
            for key, val in seg_vals.items():
                lines.append(f"  · {label_map.get(key, key)}: {val}kg")

    return "\n".join(lines)


async def analyze_current_state(
    posture_issues: list[str],
    front_score: float,
    side_score: float,
    symptoms: str,
    doc_text: str,
    rag_exercises: list[dict],
    health_info: dict = {},
    risk_tags: list[str] = [],
    analysis_mode: str = "full",
) -> dict:
    mode_instruction = {
        "full":      "자세 분석 데이터와 건강 문서를 모두 활용하여 종합적으로 분석하세요.",
        "doc_only":  "건강 문서 데이터만 있습니다. 자세 분석 없이 문서 기반으로만 추천하세요.",
        "pose_only": "자세 분석 데이터만 있습니다. 문서 없이 자세 기반으로만 추천하세요.",
        "general":   "구체적인 데이터가 없습니다. 일반적인 자세 교정 운동을 추천하세요.",
    }.get(analysis_mode, "자세 분석 데이터와 건강 문서를 모두 활용하여 종합적으로 분석하세요.")

    system_prompt = f"""당신은 전문 물리치료사이자 개인 트레이너입니다.
{mode_instruction}

운동 추천 이유를 설명할 때는 반드시 다음 흐름으로 충분히 자세하게 서술하세요:
1) 현재 어떤 자세·신체 문제가 있고 그것이 왜(어떤 원인으로) 발생했는지
2) 그래서 어느 근육/부위를 강화하거나 이완·교정해야 하는지
3) 따라서 어떤 유형의 운동을 왜 추천하는지
사용자가 이해하기 쉽도록 부위 이름과 근육을 구체적으로 언급하고, 동기부여가 되는 어조로 작성하세요.
반드시 한국어로 답변하세요.

[필수 준수 사항]
1. 모든 운동 추천은 반드시 '권장합니다', '도움이 될 수 있습니다', '고려해보세요' 등 권장형 표현만 사용하세요.
2. '해야 합니다', '금지입니다', '반드시' 등 단정적 표현은 절대 사용하지 마세요.
3. 질병, 통증, 재활 정보가 포함된 경우 반드시 의료 전문가 상담을 권장하는 문구를 포함하세요.
4. 운동 처방이 아닌 참고 정보임을 명시하세요."""

    issues_text = "\n".join([f"- {i}" for i in posture_issues]) if posture_issues else "- 없음"

    doc_section = ""
    if health_info:
        doc_section = f"\n\n## 문서 기반 건강·운동 데이터\n{_format_health_info_for_llm(health_info)}"
    elif doc_text:
        doc_section = f"\n\n## 임상 자료 내용\n{doc_text[:1500]}"

    risk_section = ""
    if risk_tags:
        risk_section = (
            "\n\n## 운동 위험 태그 (반드시 회피 + risk_areas에 반드시 반영)\n"
            + "\n".join(f"- {t}" for t in risk_tags)
            + "\n위 태그가 가리키는 신체 부위·건강 상태(예: avoid_high_intensity→혈압/심혈관, "
            "avoid_spinal_flexion_load→허리, avoid_jump→무릎, monitor_blood_sugar→혈당)는 "
            "반드시 risk_areas 항목에 사용자가 이해할 수 있는 한국어 부위·상태명으로 포함하세요."
        )

    exercises_text = "\n".join([f"- {ex['name']}: {ex['description']}" for ex in rag_exercises[:4]])

    user_message = f"""다음 정보를 바탕으로 사용자의 현재 신체 상태를 분석하고 운동을 추천해주세요.

## 자세 분석 결과
정면 점수: {front_score:.0f}/100
측면 점수: {side_score:.0f}/100
발견된 자세 문제:
{issues_text}

## 증상/불편사항
{symptoms if symptoms else "없음"}
{doc_section}{risk_section}

## 추천 가능한 운동
{exercises_text}

반드시 아래 JSON 형식으로만 응답하세요:
{{
  "state_summary": "현재 신체 상태 요약 2~3문장",
  "main_concerns": ["주요 우려사항1", "주요 우려사항2"],
  "risk_areas": ["주의가 필요한 신체 부위·건강 상태. 위험 태그나 증상(예: 고혈압, 당뇨, 허리 디스크, 무릎 통증)이 있으면 해당 부위·상태를 반드시 포함. 없으면 빈 배열"],
  "recommendation_note": "운동 추천 이유를 4~6문장으로 자세히 서술. ①현재 문제와 그 원인 → ②강화/이완해야 할 구체적 부위·근육 → ③그래서 추천하는 운동 유형, 순서로 자연스럽게 이어서 설명",
  "exercise_reasons": {{
    "운동명": "이 운동이 어느 근육·부위를 어떻게 개선하며 사용자의 현재 상태와 어떻게 연결되는지 2~3문장으로 구체적으로"
  }}
}}"""

    try:
        result = await chat(
            [{"role": "user", "content": user_message}],
            system_prompt=system_prompt,
            temperature=0.4,
            max_tokens=2000,
        )
        start = result.find("{")
        end = result.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(result[start:end])
    except Exception:
        pass

    # posture_issues가 비어도 점수가 있으면 점수 기반 관심 항목 생성
    if posture_issues:
        fallback_concerns = posture_issues[:2]
    elif front_score or side_score:
        avg = round((front_score + side_score) / 2) if front_score and side_score else int(front_score or side_score)
        fallback_concerns = [f"자세 점수 {avg}점 — 맞춤 운동으로 자세를 개선해보세요."]
    else:
        fallback_concerns = []

    return {
        "state_summary": "자세 분석 결과를 바탕으로 맞춤 운동을 추천해드립니다.",
        "main_concerns": fallback_concerns,
        "risk_areas": [],
        "recommendation_note": (
            "자세 분석에서 나타난 불균형은 특정 근육이 약해지거나 과도하게 긴장하면서 생깁니다. "
            "약해진 부위는 강화하고 긴장된 부위는 이완해 좌우·전후 균형을 회복하는 것이 핵심입니다. "
            "아래 운동들은 이런 교정 원리에 따라 선택되었으니 꾸준히 수행하면 자세와 통증 개선에 도움이 됩니다."
        ),
        "exercise_reasons": {},
    }


async def generate_weekly_report(
    stats: dict,
    symptoms: str = "",
    risk_tags: list[str] = [],
    posture_scores: dict = {},
) -> dict:
    """주간 운동 기록·자세 점수·증상을 종합한 주간 리포트 생성.

    Args:
        stats: {session_count, avg_score, score_trend, exercise_breakdown,
                best_score, worst_score, period_days}
        symptoms: 사용자 증상 텍스트
        risk_tags: 문서에서 추출된 위험 태그
        posture_scores: {front, side} 최근 자세 스캔 점수
    """
    system_prompt = """당신은 전문 물리치료사이자 개인 트레이너입니다.
사용자의 한 주간 운동 기록과 자세 데이터를 분석해 따뜻하고 동기부여가 되는 주간 리포트를 작성합니다.
의료 진단이 아닌 보조적 운동 관리 관점에서 조언하며, 반드시 한국어로 답변하세요."""

    EXERCISE_NAMES = {
        "nfa_video": "추천 운동 영상",
        "posture_scan": "자세 분석",
        "squat": "스쿼트",
        "pushup": "푸시업",
        "plank": "플랭크",
        "stretch": "스트레칭",
    }

    breakdown = stats.get("exercise_breakdown", {})
    breakdown_text = (
        "\n".join(f"- {EXERCISE_NAMES.get(k, k)}: {v}회" for k, v in breakdown.items())
        if breakdown else "- 기록 없음"
    )
    posture_text = (
        f"정면 {posture_scores.get('front', '–')} / 측면 {posture_scores.get('side', '–')}"
        if posture_scores else "최근 자세 스캔 없음"
    )
    risk_section = (
        "\n\n## 운동 위험 태그 (안전 권고 시 반드시 반영)\n"
        + "\n".join(f"- {t}" for t in risk_tags)
        if risk_tags else ""
    )

    total_count = stats.get("session_count", 0) + stats.get("gcal_session_count", 0)

    user_message = f"""다음은 사용자의 최근 {stats.get('period_days', 7)}일간 데이터입니다.

## 운동 기록
- 총 운동 횟수: {total_count}회
- 평균 자세 점수: {stats.get('avg_score', 0):.0f}/100
- 점수 추세: {stats.get('score_trend', '데이터 부족')}
- 최고/최저 점수: {stats.get('best_score', 0):.0f} / {stats.get('worst_score', 0):.0f}
- 운동 종류별 횟수:
{breakdown_text}

## 최근 자세 스캔 점수
{posture_text}

## 증상/불편사항
{symptoms if symptoms else "없음"}{risk_section}

반드시 아래 JSON 형식으로만 응답하세요:
{{
  "headline": "이번 주를 한 문장으로 요약 (격려 톤)",
  "summary": "운동 패턴·자세 변화에 대한 종합 평가 3~4문장",
  "achievements": ["이번 주 잘한 점 1~3개"],
  "improvements": ["개선이 필요한 점 1~3개"],
  "next_week_focus": ["다음 주 집중할 운동/자세 방향 2~3개"],
  "caution": "위험 태그·증상이 있을 때 전문가 상담 권고 1문장 (없으면 빈 문자열)"
}}"""

    try:
        result = await chat(
            [{"role": "user", "content": user_message}],
            system_prompt=system_prompt,
            temperature=0.5,
            max_tokens=1000,
        )
        start = result.find("{")
        end = result.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(result[start:end])
    except Exception:
        pass

    return {
        "headline": "이번 주도 운동을 이어가고 계세요!",
        "summary": f"최근 {stats.get('period_days', 7)}일간 {stats.get('session_count', 0)}회 운동했으며 "
                   f"평균 자세 점수는 {stats.get('avg_score', 0):.0f}점입니다. 꾸준함이 가장 중요합니다.",
        "achievements": ["운동을 시작하고 기록을 남겼습니다"] if stats.get("session_count", 0) else [],
        "improvements": ["주 3회 이상 규칙적인 운동을 목표로 해보세요"],
        "next_week_focus": ["자세 스캔으로 교정 포인트 점검", "꾸준한 운동 습관 유지"],
        "caution": "통증이 지속되면 전문가 상담을 권장합니다." if (risk_tags or symptoms) else "",
    }


# ── Document AI APIs ──────────────────────────────────────────────────────────

async def parse_document(content: bytes, filename: str, content_type: str) -> dict:
    """Document Parse API: 문서·PDF → 구조화 텍스트/마크다운"""
    key = _upstage_key("parse")
    if not key:
        return {"text": "", "markdown": "", "html": "", "page_count": 0}
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{UPSTAGE_BASE}/document-digitization",
            headers={"Authorization": f"Bearer {key}"},
            files={"document": (filename, content, content_type)},
            data={"model": "document-parse", "output_formats": '["markdown","text"]'},
        )
        if r.status_code != 200:
            return {"text": "", "markdown": "", "html": "", "page_count": 0}
        data = r.json()
        return {
            "text":       data.get("content", {}).get("text", ""),
            "markdown":   data.get("content", {}).get("markdown", ""),
            "html":       data.get("content", {}).get("html", ""),
            "page_count": len(data.get("elements", [])),
        }


async def classify_document(content: bytes, content_type: str) -> str:
    """Document Classify API: 문서 유형 분류 → category 문자열 반환"""
    key = _upstage_key("classify")
    if not key:
        return "other"
    data_url = f"data:application/octet-stream;base64,{base64.b64encode(content).decode()}"
    body = {
        "model": "document-classify",
        "messages": [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": data_url}}]}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "document-classify",
                "schema": {
                    "type": "string",
                    "oneOf": [
                        {"const": "inbody", "description": "인바디 체성분 분석 결과지"},
                        {"const": "other",  "description": "인바디 결과지가 아닌 기타 문서"},
                    ],
                },
            },
        },
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{UPSTAGE_BASE}/document-classification",
            headers={"Authorization": f"Bearer {key}"},
            json=body,
        )
        if r.status_code != 200:
            return "other"
        data = r.json()
        raw = data.get("choices", [{}])[0].get("message", {}).get("content", "other")
        return raw.strip().strip('"')


async def extract_health_info(content: bytes, content_type: str, category: str) -> dict:
    """Information Extract API: 카테고리별 스키마로 건강·운동 정보 추출"""
    key = _upstage_key("extract")
    if not key:
        return {}
    schema = _EXTRACT_SCHEMAS.get(category, _EXTRACT_SCHEMAS["inbody"])
    data_url = f"data:application/octet-stream;base64,{base64.b64encode(content).decode()}"
    body = {
        "model": "information-extract",
        "messages": [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": data_url}}]}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "health_info", "schema": schema},
        },
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{UPSTAGE_BASE}/information-extraction",
            headers={"Authorization": f"Bearer {key}"},
            json=body,
        )
        if r.status_code != 200:
            return {}
        data = r.json()
        raw = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        try:
            return json.loads(raw)
        except Exception:
            return {}


# ── 후처리 ────────────────────────────────────────────────────────────────────

def remove_pii_text(text: str) -> str:
    """일반 텍스트에서 민감정보 제거 (parsed_text 등에 적용)"""
    for pattern, replacement in _PII_PATTERNS:
        text = re.sub(pattern, replacement, text)
    return text


def remove_pii(data: dict) -> dict:
    """구조화 데이터(dict)에서 민감정보 제거"""
    text = json.dumps(data, ensure_ascii=False)
    for pattern, replacement in _PII_PATTERNS:
        text = re.sub(pattern, replacement, text)
    try:
        return json.loads(text)
    except Exception:
        return data


def apply_risk_tags(data: dict) -> list[str]:
    """medical_assessment 텍스트에서 운동 위험 태그 추출"""
    tags: set[str] = set()
    sources: list[str] = []

    medical = data.get("medical_assessment") or {}
    for field in ("exercise_restrictions", "symptoms", "diagnosis", "affected_body_parts"):
        val = medical.get(field, [])
        if isinstance(val, list):
            sources.extend(val)
        elif isinstance(val, str):
            sources.append(val)

    for text in sources:
        if not text:
            continue
        for keyword, tag in _RISK_TAG_MAP.items():
            if keyword in text:
                tags.add(tag)
    return sorted(tags)


def risk_tags_from_text(*texts: str) -> list[str]:
    """자유 입력 텍스트(증상·문서 원문 등)에서 운동 위험 태그 추출.

    apply_risk_tags()는 구조화된 health_info(dict)만 보지만, 사용자가
    직접 입력한 증상 문자열이나 문서 원문에는 적용되지 않으므로 이를 보완한다.
    """
    tags: set[str] = set()
    for text in texts:
        if not text:
            continue
        for keyword, tag in _RISK_TAG_MAP.items():
            if keyword in text:
                tags.add(tag)
    return sorted(tags)
