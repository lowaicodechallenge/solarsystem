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

# ── 카테고리별 Information Extract 스키마 ────────────────────────────────────
_USER_PROFILE_SCHEMA = {
    "type": "object",
    "properties": {
        "age":       {"type": ["integer", "null"], "description": "나이 (숫자만)"},
        "gender":    {"type": ["string",  "null"], "description": "성별 (male/female/null)"},
        "height_cm": {"type": ["number",  "null"], "description": "키 (단위: cm)"},
        "weight_kg": {"type": ["number",  "null"], "description": "몸무게 (단위: kg)"},
    },
}

_MEDICAL_SCHEMA = {
    "type": "object",
    "properties": {
        "diagnosis":            {"type": "array",  "items": {"type": "string"}, "description": "진단명 목록"},
        "symptoms":             {"type": "array",  "items": {"type": "string"}, "description": "증상 및 불편사항 목록"},
        "affected_body_parts":  {"type": "array",  "items": {"type": "string"}, "description": "영향 받는 신체 부위 목록"},
        "exercise_restrictions":{"type": "array",  "items": {"type": "string"}, "description": "운동 제한·금기 사항 목록"},
        "pain_level":           {"type": ["integer","null"], "description": "통증 수준 (0~10)"},
        "treatment_period":     {"type": ["string", "null"], "description": "치료 또는 회복 기간"},
        "rehabilitation_stage": {"type": ["string", "null"], "description": "재활 단계 (초기/중기/후기 등)"},
        "special_notes":        {"type": ["string", "null"], "description": "기타 특이 사항"},
    },
}

_BODY_COMPOSITION_SCHEMA = {
    "type": "object",
    "properties": {
        "inbody_score":            {"type": ["number", "null"], "description": "인바디 점수"},
        "weight_kg":               {"type": ["number", "null"], "description": "체중 (단위: kg)"},
        "skeletal_muscle_mass_kg": {"type": ["number", "null"], "description": "골격근량 (단위: kg)"},
        "body_fat_mass_kg":        {"type": ["number", "null"], "description": "체지방량 (단위: kg)"},
        "body_fat_percentage":     {"type": ["number", "null"], "description": "체지방률 (단위: %)"},
        "bmi":                     {"type": ["number", "null"], "description": "BMI 지수"},
        "waist_hip_ratio":         {"type": ["number", "null"], "description": "허리-엉덩이 비율"},
        "basal_metabolic_rate_kcal":{"type": ["number", "null"], "description": "기초대사량 (단위: kcal)"},
        "visceral_fat_level":      {"type": ["number", "null"], "description": "내장지방 레벨"},
        "segmental_muscle_balance": {
            "type": "object",
            "properties": {
                "left_arm":  {"type": ["number", "null"], "description": "왼팔 근육량 (단위: kg)"},
                "right_arm": {"type": ["number", "null"], "description": "오른팔 근육량 (단위: kg)"},
                "trunk":     {"type": ["number", "null"], "description": "몸통 근육량 (단위: kg)"},
                "left_leg":  {"type": ["number", "null"], "description": "왼다리 근육량 (단위: kg)"},
                "right_leg": {"type": ["number", "null"], "description": "오른다리 근육량 (단위: kg)"},
            },
        },
    },
}

_FITNESS_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "score":       {"type": ["number", "null"], "description": "점수"},
        "grade":       {"type": ["string", "null"], "description": "등급"},
        "measurement": {"type": ["string", "null"], "description": "측정값 (단위 포함)"},
    },
}

_FITNESS_ASSESSMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "cardiovascular_endurance": _FITNESS_ITEM_SCHEMA,
        "muscular_strength":        _FITNESS_ITEM_SCHEMA,
        "muscular_endurance":       _FITNESS_ITEM_SCHEMA,
        "flexibility":              _FITNESS_ITEM_SCHEMA,
        "agility":                  _FITNESS_ITEM_SCHEMA,
        "power":                    _FITNESS_ITEM_SCHEMA,
        "balance":                  _FITNESS_ITEM_SCHEMA,
        "overall_fitness_level":    {"type": ["string", "null"], "description": "종합 체력 등급"},
    },
}

_EXTRACT_SCHEMAS: dict[str, dict] = {
    "inbody": {
        "type": "object",
        "properties": {
            "user_profile":    _USER_PROFILE_SCHEMA,
            "body_composition": _BODY_COMPOSITION_SCHEMA,
        },
        "required": [],
    },
    "national_fitness_100": {
        "type": "object",
        "properties": {
            "user_profile":      _USER_PROFILE_SCHEMA,
            "fitness_assessment": _FITNESS_ASSESSMENT_SCHEMA,
        },
        "required": [],
    },
    "rehabilitation_guide": {
        "type": "object",
        "properties": {
            "user_profile":      _USER_PROFILE_SCHEMA,
            "medical_assessment": _MEDICAL_SCHEMA,
        },
        "required": [],
    },
    "health_checkup": {
        "type": "object",
        "properties": {
            "user_profile":      _USER_PROFILE_SCHEMA,
            "medical_assessment": _MEDICAL_SCHEMA,
        },
        "required": [],
    },
    "other": {
        "type": "object",
        "properties": {
            "user_profile":      _USER_PROFILE_SCHEMA,
            "medical_assessment": _MEDICAL_SCHEMA,
            "body_composition":  _BODY_COMPOSITION_SCHEMA,
            "fitness_assessment": _FITNESS_ASSESSMENT_SCHEMA,
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


def _format_health_info_for_llm(health_info: dict) -> str:
    lines: list[str] = []

    profile = health_info.get("user_profile") or {}
    profile_vals = {k: v for k, v in profile.items() if v is not None}
    if profile_vals:
        lines.append("[사용자 프로필]")
        if profile_vals.get("age"):       lines.append(f"- 나이: {profile_vals['age']}세")
        if profile_vals.get("gender"):    lines.append(f"- 성별: {profile_vals['gender']}")
        if profile_vals.get("height_cm"): lines.append(f"- 키: {profile_vals['height_cm']}cm")
        if profile_vals.get("weight_kg"): lines.append(f"- 체중: {profile_vals['weight_kg']}kg")

    medical = health_info.get("medical_assessment") or {}
    if any(v for v in medical.values() if v):
        lines.append("\n[의료 평가]")
        if medical.get("diagnosis"):            lines.append(f"- 진단: {', '.join(medical['diagnosis'])}")
        if medical.get("symptoms"):             lines.append(f"- 증상: {', '.join(medical['symptoms'])}")
        if medical.get("exercise_restrictions"):lines.append(f"- 운동 제한: {', '.join(medical['exercise_restrictions'])}")
        if medical.get("rehabilitation_stage"): lines.append(f"- 재활 단계: {medical['rehabilitation_stage']}")
        if medical.get("treatment_period"):     lines.append(f"- 치료 기간: {medical['treatment_period']}")

    body = health_info.get("body_composition") or {}
    if any(v for v in body.values() if v is not None):
        lines.append("\n[체성분 (인바디)]")
        if body.get("inbody_score") is not None:          lines.append(f"- 인바디 점수: {body['inbody_score']}")
        if body.get("body_fat_percentage") is not None:   lines.append(f"- 체지방률: {body['body_fat_percentage']}%")
        if body.get("skeletal_muscle_mass_kg") is not None: lines.append(f"- 골격근량: {body['skeletal_muscle_mass_kg']}kg")
        if body.get("bmi") is not None:                   lines.append(f"- BMI: {body['bmi']}")
        if body.get("visceral_fat_level") is not None:    lines.append(f"- 내장지방 레벨: {body['visceral_fat_level']}")

    fitness = health_info.get("fitness_assessment") or {}
    if any(v for v in fitness.values() if v is not None):
        lines.append("\n[체력 평가 (국민체력100)]")
        if fitness.get("overall_fitness_level"): lines.append(f"- 종합 등급: {fitness['overall_fitness_level']}")
        for key, label in [
            ("cardiovascular_endurance", "심폐지구력"),
            ("muscular_strength", "근력"),
            ("muscular_endurance", "근지구력"),
            ("flexibility", "유연성"),
            ("agility", "민첩성"),
            ("power", "순발력"),
            ("balance", "평형성"),
        ]:
            item = (fitness.get(key) or {})
            if item.get("grade"):
                lines.append(f"- {label}: {item['grade']} ({item.get('measurement', '')})")

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
) -> dict:
    system_prompt = """당신은 전문 물리치료사이자 개인 트레이너입니다.
사용자의 자세 분석 결과, 증상, 임상 자료를 종합하여 현재 신체 상태를 평가하고 적합한 운동을 추천합니다.
반드시 한국어로 답변하세요."""

    issues_text = "\n".join([f"- {i}" for i in posture_issues]) if posture_issues else "- 없음"

    doc_section = ""
    if health_info:
        doc_section = f"\n\n## 문서 기반 건강·운동 데이터\n{_format_health_info_for_llm(health_info)}"
    elif doc_text:
        doc_section = f"\n\n## 임상 자료 내용\n{doc_text[:1500]}"

    risk_section = ""
    if risk_tags:
        risk_section = "\n\n## 운동 위험 태그 (반드시 회피)\n" + "\n".join(f"- {t}" for t in risk_tags)

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
                        {"const": "inbody",              "description": "인바디 체성분 분석 결과지"},
                        {"const": "national_fitness_100","description": "국민체력100 체력 측정 결과지"},
                        {"const": "rehabilitation_guide","description": "재활 안내문 또는 물리치료 처방전"},
                        {"const": "health_checkup",      "description": "건강검진표 또는 건강검진 결과지"},
                        {"const": "other",               "description": "위 유형에 해당하지 않는 기타 문서"},
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
    schema = _EXTRACT_SCHEMAS.get(category, _EXTRACT_SCHEMAS["other"])
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
