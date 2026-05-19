# 자세 분석 스코어링 로직

파일 위치: `src/lib/poseAnalysis.ts`

점수는 100점에서 시작하며, 감지된 자세 문제에 따라 감점됩니다.
최저 점수는 0점입니다.

---

## 공통 사항

- **기준 단위 (`refWidth`)**: 좌우 어깨 랜드마크 간 픽셀 거리. 카메라와의 거리에 따른 스케일 차이를 보정합니다.
- **랜드마크 신뢰도**: score > 0.35 인 랜드마크만 사용합니다.
- **점수 버퍼**: 캡처 시 마지막 1.5초(약 45프레임)의 점수 평균을 최종 점수로 사용합니다.
- **촬영 뷰**: `isSideView = false` → 정면 촬영, `isSideView = true` → 측면 촬영. 일부 항목은 특정 뷰에서만 동작합니다.

---

## 1. 거북목 (Forward Head Posture)

**적용 뷰**: 정면 + 측면 (항상 측정)

**사용 랜드마크**: `left_ear`, `right_ear`, `left_shoulder`, `right_shoulder`

**측정 방법**:
- **기울기 각도 (`tiltDeg`)**: 귀 중앙 ↔ 어깨 중앙의 수평 이탈을 `atan2(|dx|, dy)`로 계산 (단위: 도). 귀가 어깨 정수직 위에 있으면 0°.
- **z축 깊이 (`zDiff`)**: `earZ - shoulderZ`. 음수일수록 귀가 카메라 쪽(앞)으로 나온 것.

**감점 (누적 합산)**:

| 조건 | 추가 감점 |
|------|-----------|
| `tiltDeg > 13°` OR `zDiff < -0.08` | -5점 |
| `tiltDeg > 22°` OR `zDiff < -0.15` | -8점 추가 |
| `tiltDeg > 35°` OR `zDiff < -0.25` | -12점 추가 |

> 세 조건은 모두 독립적으로 누적됩니다. 최대 감점은 -25점입니다.

---

## 2. 어깨 말림 (Rounded Shoulders)

**적용 뷰**: 정면 + 측면 (항상 측정, z축 기반이라 측면에서 더 정확)

**사용 랜드마크**: `left_ear`, `right_ear`, `left_shoulder`, `right_shoulder`

**측정 방법**:
- **`zDiff`**: `shoulderZ - earZ`. 음수일수록 어깨가 귀보다 카메라 앞으로 나온 것 → 말린 어깨.
- **`avgGap`**: 좌우 각각 `|shoulder.x - ear.x| / refWidth` 의 평균. 노이즈 필터 역할.

**감점**:

| 조건 | 심각도 | 감점 |
|------|--------|------|
| `zDiff < -0.20` AND `avgGap > 0.28` | error | -10점 |
| `zDiff < -0.12` AND `avgGap > 0.16` | warning | -5점 |

---

## 3. 골반 기울기 (Lateral Pelvic Tilt)

**적용 뷰**: 정면 + 측면 (항상 측정)

**사용 랜드마크**: `left_hip`, `right_hip`

**측정 방법**:
- **`normalized`**: `|left_hip.y - right_hip.y| / refWidth`. 좌우 골반의 높이 차 비율.

**감점**:

| 조건 | 심각도 | 감점 |
|------|--------|------|
| `normalized > 0.13` | error | -10점 |
| `normalized > 0.07` | warning | -5점 |

---

## 4. 어깨 비대칭 (Shoulder Height Asymmetry)

**적용 뷰**: 정면 + 측면 (항상 측정)

**사용 랜드마크**: `left_shoulder`, `right_shoulder`

**측정 방법**:
- **`normalized`**: `|left_shoulder.y - right_shoulder.y| / refWidth`. 좌우 어깨 높이 차 비율.

**감점**:

| 조건 | 심각도 | 감점 |
|------|--------|------|
| `normalized > 0.13` | error | -7점 |
| `normalized > 0.07` | warning | -3점 |

---

## 5. 과신전 (Spinal Hyperextension)

**적용 뷰**: 정면/측면 별도 로직

**사용 랜드마크**: `left_shoulder`, `right_shoulder`, `left_hip`, `right_hip`, `left_ankle`, `right_ankle`

### 측면 촬영 (`isSideView = true`)

**측정 방법**:
- **`hipProtrusion`**: `hipZ - (shoulderZ + ankleZ) / 2`. 골반이 어깨·발목 평균 z값보다 앞으로 나온 정도.

| 조건 | 심각도 | 감점 |
|------|--------|------|
| `hipProtrusion > 0.13` | error | -13점 |
| `hipProtrusion > 0.07` | warning | -7점 |

### 정면 촬영 (`isSideView = false`)

**측정 방법**:
- **`lateralDev`**: `max(|shoulderMid.x - ankleMid.x|, |hipMid.x - ankleMid.x|) / refWidth`. 어깨·골반이 발목 기준에서 좌우로 얼마나 이탈했는지.

| 조건 | 심각도 | 감점 |
|------|--------|------|
| `lateralDev > 0.22` | error | -13점 |
| `lateralDev > 0.13` | warning | -7점 |

---

## 6. 골반 경사 (Anterior / Posterior Pelvic Tilt)

**적용 뷰**: 측면 전용 (`isSideView = true`)

**사용 랜드마크**: `left_shoulder`, `right_shoulder`, `left_hip`, `right_hip`, `left_knee`, `right_knee`

**측정 방법**:
- 어깨 중앙(A) → 골반 중앙(B, 꼭짓점) → 무릎 중앙(C) 세 점으로 내각 계산.
- `pelvicTiltAngle = calcAngle(shoulderMid, hipMid, kneeMid)` (단위: 도, 범위 0°~180°)
- **방향 판별**: `acos`는 0°~180°만 반환하므로 외적(cross product)으로 전방/후방을 구분.
  ```
  cross = (knee - shoulder) × (hip - shoulder)
  cross > 0 → 전방경사 (Anterior)
  cross < 0 → 후방경사 (Posterior)
  ```

**감점**:

| 조건 | 유형 | 심각도 | 감점 |
|------|------|--------|------|
| `cross > 0` AND `pelvicTiltAngle < 160°` | 전방경사 | error | -7점 |
| `cross > 0` AND `pelvicTiltAngle < 170°` | 전방경사 | warning | -3점 |
| `cross < 0` AND `pelvicTiltAngle < 160°` | 후방경사 | error | -7점 |
| `cross < 0` AND `pelvicTiltAngle < 170°` | 후방경사 | warning | -3점 |

---

## 최대 감점 요약

| 항목 | 최대 감점 | 뷰 |
|------|-----------|----|
| 거북목 | -25점 | 공통 |
| 어깨 말림 | -10점 | 공통 (측면 권장) |
| 골반 기울기 | -10점 | 공통 |
| 어깨 비대칭 | -7점 | 공통 |
| 과신전 | -13점 | 뷰별 분기 |
| 골반 경사 (전방/후방) | -7점 | 측면 전용 |
| **합계** | **-72점** | |
