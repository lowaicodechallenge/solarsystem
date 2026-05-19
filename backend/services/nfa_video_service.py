"""
국민체력100 동영상 API 서비스 (NFA = National Fitness Award)

흐름:
  1. AI 분석 결과(goal) → LLM이 부상/강화·재활 부위 분류
     - 부상(급성통증·염증·관절염) → 제외
     - 교정·강화·재활 필요 → 타겟 부위로 MSCL 쿼리
  2. 타겟 부위별 MSCL + PRSC 병렬 호출
  3. file_nm 기준 중복 제거 → 정규화 → 필터링 → 정렬
"""
import asyncio
import json
import os
import random
import re
import xml.etree.ElementTree as ET

import httpx

from services.llm_provider import chat

NFA_API_KEY = os.getenv("NFA_API_KEY", "")
NFA_BASE_URL = "https://apis.data.go.kr/B551014/SRVC_TODZ_VDO_PKG"

OP_PRESCRIPTION     = "TODZ_VDO_TRNG_VIDEO_I"   # 운동처방동영상 목록 조회
OP_MUSCULOSKELETAL  = "TODZ_VDO_MSCL_TRNG_I"    # 근골격계운동 목록 조회


# ── 1. LLM 파라미터 변환 ──────────────────────────────────────────────────────

_MAPPING_SYSTEM = """당신은 사용자 건강 데이터를 국민체력100 동영상 API 검색 조건으로 변환합니다.
반드시 아래 허용값만 사용하세요.

age_group     : 유소년 | 청소년 | 성인 | 어르신 | 공통
exercise_purpose : 체력증진 | 재활 | 스트레칭 | 균형감각 | 심폐지구력 | 근력강화
body_part     : 목 | 어깨 | 팔 | 허리 | 복부 | 하체 | 전신 | 목/어깨 | 어깨/팔
exercise_place: 실내 | 실외 | 헬스장
exercise_level: 초급 | 중급 | 고급

JSON만 반환하세요. 설명 없이."""

async def map_user_to_api_params(user_context: dict) -> dict:
    prompt = (
        f"사용자 데이터:\n{json.dumps(user_context, ensure_ascii=False, indent=2)}\n\n"
        '아래 형식으로 변환:\n'
        '{"age_group":"성인","exercise_purpose":"스트레칭",'
        '"body_part":"목/어깨","exercise_place":"실내","exercise_level":"초급"}'
    )
    try:
        raw = await chat(
            messages=[{"role": "user", "content": prompt}],
            system_prompt=_MAPPING_SYSTEM,
            temperature=0.1,
            max_tokens=200,
        )
        m = re.search(r"\{.*?\}", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
    except Exception:
        pass
    return {
        "age_group": "성인",
        "exercise_purpose": "스트레칭",
        "body_part": "전신",
        "exercise_place": "실내",
        "exercise_level": "초급",
    }


# ── 1-B. 분석 결과 → 타겟 부위 분류 ─────────────────────────────────────────

# MSCL DB에 실제 데이터가 있는 부위만 (어깨 202개, 허리 210개, 무릎 259개)
_VALID_MSCL = {"어깨", "허리", "무릎"}

_CLASSIFY_SYSTEM = """너는 물리치료사 겸 운동 처방 전문가야.
AI가 분석한 사용자 신체 상태를 읽고, 국민체력100 운동 영상에서 검색할 부위를 결정해.

────────────────────────────────────────
■ 운동 추천 대상 (target에 포함)
  · 자세 교정: 거북목, 어깨 말림(라운드숄더), 골반 비대칭, 골반 기울기, 척추 측만, 과신전
  · 근력 강화: 코어 약화, 근육 불균형, 근력 저하, 체형 교정 필요
  · 만성/재활: 만성 통증(급성 아닌 것), 회복 단계, 재활 운동 필요

■ 운동 금지 (target에서 제외)
  · 급성 부상: 급성 통증, 염좌, 골절, 수술 직후
  · 활성 염증: 관절염 급성기, 건염, 점액낭염
  · 명시된 운동 제한 부위

────────────────────────────────────────
■ 부위 매핑 (반드시 아래 3개 중에서만 선택)

  어깨 → 거북목, 어깨 말림, 목/어깨 통증, 승모근 긴장, 경추 문제, 목 교정,
         팔/팔꿈치/손목 통증
  허리 → 골반 비대칭, 골반 기울기, 요통, 척추 측만, 코어 약화, 과신전, 허리 교정,
         고관절(엉덩관절) 통증·불균형, 골반 통증, 엉덩이/둔근 약화, 복부 약화
  무릎 → 무릎 통증(만성·재활), 하체 근력 약화, 다리 불균형, 발목/종아리 문제,
         고관절·하체 연계 근력 저하

  ※ 같은 문제가 여러 부위에 해당하면 모두 포함 (예: 거북목+골반 → ["어깨","허리"])
  ※ 고관절·골반·엉덩이·하체·다리 문제는 기본적으로 "허리"에 매핑하고,
     하체 근력·다리와 관련되면 "무릎"도 함께 포함
  ※ 표에 정확히 없는 부위라도 가장 인접한 부위로 매핑하라.
     절대로 빈 배열([])을 반환하지 마라 — 최소 1개 부위는 반드시 선택
  ※ 해당 부위가 운동 금지 조건이면 제외

────────────────────────────────────────
■ 출력 형식 (JSON만, 설명 없이)
{"target_parts": ["어깨", "허리"], "exercise_place": "실내"}

장소 선택: 실내 | 실외 | 헬스장"""


async def _classify_for_nfa(goal: str, place_hint: str = "실내") -> dict:
    """분석 결과에서 운동 타겟 부위(교정/재활)와 장소를 결정."""
    if not goal:
        return {"target_parts": [], "exercise_place": place_hint}
    prompt = f"분석 결과: {goal}\n선호 장소: {place_hint}"
    try:
        raw = await chat(
            messages=[{"role": "user", "content": prompt}],
            system_prompt=_CLASSIFY_SYSTEM,
            temperature=0.0,
            max_tokens=100,
        )
        m = re.search(r"\{.*?\}", raw, re.DOTALL)
        if m:
            data = json.loads(m.group())
            return {
                "target_parts": [p for p in data.get("target_parts", []) if p in _VALID_MSCL],
                "exercise_place": data.get("exercise_place", place_hint),
            }
    except Exception:
        pass
    return {"target_parts": [], "exercise_place": place_hint}


# ── 2. API 호출 ───────────────────────────────────────────────────────────────

async def _fetch(operation: str, extra_params: dict, num_rows: int = 30) -> list[dict]:
    params = {
        "serviceKey": NFA_API_KEY,
        "pageNo": 1,
        "numOfRows": num_rows,
        "resultType": "XML",
        **extra_params,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{NFA_BASE_URL}/{operation}", params=params)
            r.raise_for_status()
            root = ET.fromstring(r.content)

            result_code = root.findtext("header/resultCode", "")
            if result_code not in ("00", "0", ""):
                msg = root.findtext("header/resultMsg", "")
                print(f"[NFA] {operation} API error {result_code}: {msg}", flush=True)
                return []

            items = root.find("body/items")
            if items is None:
                print(f"[NFA] {operation} -> no items element", flush=True)
                return []

            result = []
            for item in items.findall("item"):
                d = {child.tag: (child.text or "") for child in item}
                result.append(d)

            print(f"[NFA] {operation} -> {len(result)} items", flush=True)
            if result:
                print(f"[NFA] sample keys: {list(result[0].keys())}", flush=True)
            return result
    except Exception as e:
        print(f"[NFA] {operation} error: {e}", flush=True)
    return []


# ── 3. 정규화 ─────────────────────────────────────────────────────────────────

_LEVEL_MAP  = {"초급": "beginner", "중급": "intermediate", "고급": "advanced",
               "1단계": "beginner", "2단계": "intermediate", "3단계": "advanced"}
_PLACE_MAP  = {"실내": "home", "실외": "outdoor", "헬스장": "gym"}
_PURPOSE_MAP = {"스트레칭": "stretching", "재활": "rehabilitation",
                "체력증진": "fitness", "근력강화": "strength", "심폐지구력": "cardio"}


def _normalize(item: dict) -> dict | None:
    file_url = item.get("file_url", "")
    file_nm  = item.get("file_nm", "")
    if not file_url or not file_nm:
        return None

    img_base = item.get("img_file_url", "")
    img_nm   = item.get("img_file_nm", "")

    # 운동부위: 근골격계는 trng_part_nm, 운동처방은 trng_mscl_part
    body_raw = item.get("trng_part_nm") or item.get("trng_mscl_part", "")
    body_parts = [p.strip() for p in body_raw.split(",") if p.strip()]

    level_raw = item.get("trng_step_nm", "")
    place_raw = item.get("trng_plc_nm", "")
    tool      = item.get("tool_nm", "") or ""

    try:
        duration_min = round(int(item.get("vdo_len", 0)) / 60, 1)
    except (ValueError, TypeError):
        duration_min = 0.0

    def _join(base: str, name: str) -> str:
        if not base:
            return name
        return base.rstrip("/") + "/" + name.lstrip("/")

    return {
        "source":              "NFA_VIDEO_API",
        "file_nm":             file_nm,           # dedup 키 (반환 전 제거)
        "title":               item.get("vdo_ttl_nm") or item.get("trng_nm", ""),
        "description":         item.get("vdo_desc", ""),
        "video_url":           _join(file_url, file_nm),
        "thumbnail_url":       _join(img_base, img_nm) if img_base and img_nm else "",
        "target_body_part":    body_parts,
        "purpose_tags":        [],                # 필터링 후 채움
        "level":               _LEVEL_MAP.get(level_raw, "beginner"),
        "intensity":           "low" if level_raw in ("초급", "1단계") else "medium",
        "place":               _PLACE_MAP.get(place_raw, "home"),
        "equipment":           tool if tool else "none",
        "duration_min":        duration_min,
        "avoid_if":            [],
        "verification_status": "needs_review",
        "age_group":           item.get("aggrp_nm", "공통"),
    }


# ── 4. 필터링 ─────────────────────────────────────────────────────────────────

def _is_valid(v: dict, pain_areas: list[str]) -> bool:
    return bool(v.get("video_url")) and bool(v.get("title"))


# ── 5. 메인 추천 함수 ─────────────────────────────────────────────────────────

async def recommend_nfa_videos(
    user_context: dict,
    health_info: dict | None = None,
    risk_tags: list[str] | None = None,
    max_results: int = 8,
) -> list[dict]:
    """
    사용자 데이터 기반 NFA 동영상 추천 풀파이프라인.

    Args:
        user_context: age, goal, pain_area, place, level, available_time_min 등
        health_info:  문서 분석 결과 (HealthInfo 구조)
        risk_tags:    위험 태그 목록
        max_results:  반환할 최대 영상 수
    """
    health_info = health_info or {}
    risk_tags   = risk_tags or []
    pain_areas  = user_context.get("pain_area", [])

    # Step 1: 분석 결과 → 교정/재활 타겟 부위 + 장소 분류
    place_raw = user_context.get("place", "home")
    place_hint = "헬스장" if place_raw == "gym" else ("실외" if place_raw == "outdoor" else "실내")
    goal = user_context.get("goal", "")

    classified = await _classify_for_nfa(goal, place_hint)
    target_parts = classified["target_parts"]
    exercise_place = classified["exercise_place"]

    print(f"[NFA] goal={goal!r} → target_parts={target_parts}, place={exercise_place}", flush=True)

    # 분류 실패/빈 결과 시: 무필터 조회는 API 기본정렬상 한 부위(어깨)로 쏠리므로
    # 유효 3부위를 각각 조회해 라운드로빈으로 고르게 섞는다.
    if not target_parts:
        target_parts = list(_VALID_MSCL)
    mscl_tasks = [
        _fetch(OP_MUSCULOSKELETAL, {"trng_part_nm": p}, num_rows=50)
        for p in target_parts
    ]

    # Step 2: 타겟 부위별 MSCL + PRSC 병렬 호출
    # PRSC는 장소 필터만 (aggrp_nm=성인 등은 DB에 데이터 없음)
    prsc_params: dict = {}
    if exercise_place:
        prsc_params["trng_plc_nm"] = exercise_place

    *raw_mscl_list, raw_prsc = await asyncio.gather(
        *mscl_tasks,
        _fetch(OP_PRESCRIPTION, prsc_params, num_rows=80),
    )
    # Step 3: 부위별로 정규화·중복 제거 후 부위 내 셔플
    #   raw_mscl_list[i] 는 mscl_tasks[i] 결과이므로 part_labels[i] 와 1:1 대응.
    #   부위별로 따로 모아두어야 특정 부위가 결과를 독점하지 않는다.
    seen: set[str] = set()
    part_labels = target_parts or ["_all"]
    by_part: dict[str, list[dict]] = {}
    for label, sub in zip(part_labels, raw_mscl_list):
        bucket = by_part.setdefault(label, [])
        for item in sub:
            v = _normalize(item)
            if v and _is_valid(v, pain_areas) and v["file_nm"] not in seen:
                seen.add(v["file_nm"])
                bucket.append(v)
    for bucket in by_part.values():
        random.shuffle(bucket)  # 같은 분류여도 매 호출 다른 영상이 나오도록

    # Step 4: 부위 라운드로빈 인터리빙 — 분류된 모든 부위가 균등 노출
    interleaved: list[dict] = []
    unique_labels = list(dict.fromkeys(part_labels))
    while len(interleaved) < max_results and any(by_part.values()):
        for label in unique_labels:
            bucket = by_part.get(label)
            if bucket:
                interleaved.append(bucket.pop(0))
                if len(interleaved) >= max_results:
                    break

    # Step 5: 부족분은 PRSC(운동처방)에서 셔플 후 보충
    if len(interleaved) < max_results:
        prsc_pool: list[dict] = []
        for item in raw_prsc:
            v = _normalize(item)
            if v and _is_valid(v, pain_areas) and v["file_nm"] not in seen:
                seen.add(v["file_nm"])
                prsc_pool.append(v)
        random.shuffle(prsc_pool)
        interleaved.extend(prsc_pool[: max_results - len(interleaved)])

    # 내부 dedup 키 제거 후 반환
    for v in interleaved:
        v.pop("file_nm", None)
    return interleaved
