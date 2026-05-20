# 자세 분석 스코어링 로직 v2

파일 위치: `src/lib/poseAnalysis.ts`

점수는 100점에서 시작하며, 감지된 자세 문제에 따라 감점됩니다.
최저 점수는 0점입니다.

---

## 공통 사항

- **기준 단위 (`refWidth`)**: 좌우 어깨 랜드마크 간 픽셀 거리. 카메라와의 거리에 따른 스케일 차이를 보정합니다.
- **랜드마크 신뢰도**: score > 0.35 인 랜드마크만 사용합니다.
- **점수 버퍼**: 캡처 시 마지막 1.5초(약 45프레임)의 점수 평균을 최종 점수로 사용합니다.
- **촬영 뷰**: `isSideView = false` → 정면 촬영, `isSideView = true` → 측면 촬영. 일부 항목은 특정 뷰에서만 동작합니다.
- **측면 촬영 방향 고정**: 사용자의 **오른쪽**이 카메라에 찍히도록 서야 합니다. 무릎 과신전(#8)·골반 경사(#7)의 cross 부호가 이 방향으로 하드코딩되어 있습니다. 방향이 바뀌면 해당 부호도 반전해야 합니다.

---

## 1. 거북목 (Forward Head Posture)

**적용 뷰**: 공통 (정면 + 측면)

**사용 랜드마크**: `left_ear`, `right_ear`, `left_shoulder`, `right_shoulder`

**측정 방법**:
- **기울기 각도 (`tiltDeg`)**: 귀 중앙 ↔ 어깨 중앙의 수평 이탈을 `atan2(|dx|, dy)`로 계산 (단위: 도). 귀가 어깨 정수직 위에 있으면 0°.
- **z축 깊이 (`zDiff`)**: `earZ - shoulderZ`. 음수일수록 귀가 카메라 쪽(앞)으로 나온 것.

**감점 (누적 합산, AND 조건)**:

| 단계 | 조건 | 감점 |
|------|------|------|
| 경미 | `tiltDeg > 13°` **AND** `zDiff < -0.08` | -5점 |
| 중간 | `tiltDeg > 22°` **AND** `zDiff < -0.15` | -8점 추가 |
| 심각 | `tiltDeg > 35°` **AND** `zDiff < -0.25` | -7점 추가 |

> 세 조건 모두 독립적으로 누적됩니다. 최대 감점은 **-20점**입니다.  
> z 단독 조건은 사용하지 않습니다 (노이즈 방지를 위해 x/y 기반 조건과 AND로 묶음).

---

## 2. 머리 기울기 (Head Lateral Tilt)

**적용 뷰**: 정면 전용 (`isSideView = false`)

**사용 랜드마크**: `left_ear`, `right_ear`, `left_shoulder`, `right_shoulder`

**측정 방법**:
- **`normalized`**: `|left_ear.y - right_ear.y| / refWidth`. 좌우 귀 높이 차를 어깨 너비로 정규화.

**감점 (중복 없이 더 심한 조건 하나만 적용)**:

| 조건 | 심각도 | 감점 |
|------|--------|------|
| `normalized > 0.13` | error | -7점 |
| `normalized > 0.07` | warning | -3점 |

---

## 3. 어깨 말림 (Rounded Shoulders)

**적용 뷰**: 측면 전용 (`isSideView = true`)

**사용 랜드마크**: `left_ear`, `right_ear`, `left_shoulder`, `right_shoulder`

**측정 방법**:
- **`zDiff`**: `shoulderZ - earZ`. 음수일수록 어깨가 귀보다 카메라 앞으로 나온 것 → 말린 어깨.
- **`avgGap`**: 좌우 각각 `|shoulder.x - ear.x| / refWidth` 의 평균. 노이즈 필터 역할.

**감점 (중복 없음)**:

| 조건 | 심각도 | 감점 |
|------|--------|------|
| `zDiff < -0.20` AND `avgGap > 0.28` | error | -10점 |
| `zDiff < -0.12` AND `avgGap > 0.16` | warning | -5점 |

---

## 4. 어깨 비대칭 (Shoulder Height Asymmetry)

**적용 뷰**: 정면 전용 (`isSideView = false`)

**사용 랜드마크**: `left_shoulder`, `right_shoulder`

**측정 방법**:
- **`normalized`**: `|left_shoulder.y - right_shoulder.y| / refWidth`.

**감점 (중복 없음)**:

| 조건 | 심각도 | 감점 |
|------|--------|------|
| `normalized > 0.13` | error | -7점 |
| `normalized > 0.07` | warning | -3점 |

---

## 5. 골반 기울기 (Lateral Pelvic Tilt)

**적용 뷰**: 정면 전용 (`isSideView = false`)

**사용 랜드마크**: `left_hip`, `right_hip`

**측정 방법**:
- **`normalized`**: `|left_hip.y - right_hip.y| / refWidth`.

**감점 (중복 없음)**:

| 조건 | 심각도 | 감점 |
|------|--------|------|
| `normalized > 0.13` | error | -10점 |
| `normalized > 0.07` | warning | -5점 |

---

## 6. 골반 전방 변위 (Anterior Pelvic Shift)

**적용 뷰**: 측면 전용 (`isSideView = true`)

**사용 랜드마크**: `left_shoulder`, `right_shoulder`, `left_hip`, `right_hip`, `left_ankle`, `right_ankle`

**측정 방법**:
- **`hipProtrusion`**: `hipZ - (shoulderZ + ankleZ) / 2`. 골반이 어깨·발목 평균 z값보다 앞으로 나온 정도 (양수 = 앞으로).

**감점 (중복 없음)**:

| 조건 | 심각도 | 감점 |
|------|--------|------|
| `hipProtrusion > 0.13` | error | -13점 |
| `hipProtrusion > 0.07` | warning | -7점 |

---

## 7. 골반 경사 (Anterior / Posterior Pelvic Tilt)

**적용 뷰**: 측면 전용 (`isSideView = true`)

**사용 랜드마크**: `left_shoulder`, `right_shoulder`, `left_hip`, `right_hip`, `left_knee`, `right_knee`

**측정 방법**:
- 어깨 중앙(A) → 골반 중앙(B, 꼭짓점) → 무릎 중앙(C) 세 점으로 내각 계산.
- `pelvicTiltAngle = calcAngleDeg(shoulderMid, hipMid, kneeMid)` (단위: 도, 범위 0°~180°)
- **방향 판별**: `cross2D(shoulderMid, hipMid, kneeMid)`
  ```
  crossVal > 0 → 전방경사 (Anterior)
  crossVal < 0 → 후방경사 (Posterior)
  ※ 오른쪽 측면 촬영 기준. 방향 변경 시 부호 반전 필요.
  ```

**감점 (중복 없음)**:

| 조건 | 유형 | 심각도 | 감점 |
|------|------|--------|------|
| `crossVal > 0` AND `pelvicTiltAngle < 160°` | 전방경사 | error | -7점 |
| `crossVal > 0` AND `pelvicTiltAngle < 170°` | 전방경사 | warning | -3점 |
| `crossVal < 0` AND `pelvicTiltAngle < 160°` | 후방경사 | error | -7점 |
| `crossVal < 0` AND `pelvicTiltAngle < 170°` | 후방경사 | warning | -3점 |

---

## 8. 무릎 과신전 (Knee Hyperextension)

**적용 뷰**: 측면 전용 (`isSideView = true`)

**사용 랜드마크**: `left_hip`, `right_hip`, `left_knee`, `right_knee`, `left_ankle`, `right_ankle`

**측정 방법**:
- 골반 중앙(A) → 무릎 중앙(B, 꼭짓점) → 발목 중앙(C) 내각 계산.
- `kneeAngle = calcAngleDeg(hipMid, kneeMid, ankleMid)`
- **방향 판별**: `crossKnee = cross2D(hipMid, kneeMid, ankleMid)`
  ```
  crossKnee < 0 → 무릎이 뒤로 꺾인 것 (과신전)
  ※ 오른쪽 측면 촬영 기준. 방향 변경 시 부호 반전 필요.
  ```

**감점 (중복 없음)**:

| 조건 | 심각도 | 감점 |
|------|--------|------|
| `crossKnee < 0` AND `kneeAngle > 180°` | error | -7점 |
| `crossKnee < 0` AND `kneeAngle > 175°` | warning | -3점 |

---

## 9. 몸통 측방 이탈 (Lateral Trunk Shift)

**적용 뷰**: 정면 전용 (`isSideView = false`)

**사용 랜드마크**: `left_shoulder`, `right_shoulder`, `left_hip`, `right_hip`, `left_ankle`, `right_ankle`

**측정 방법**:
- **`lateralDev`**: `max(|shoulderMid.x - ankleMid.x|, |hipMid.x - ankleMid.x|) / refWidth`.

**감점 (중복 없음)**:

| 조건 | 심각도 | 감점 |
|------|--------|------|
| `lateralDev > 0.22` | error | -7점 |
| `lateralDev > 0.13` | warning | -3점 |

---

## 최대 감점 요약

| # | 항목 | 적용 뷰 | 최대 감점 |
|---|------|---------|-----------|
| 1 | 거북목 | 공통 | -20점 |
| 2 | 머리 기울기 | 정면 전용 | -7점 |
| 3 | 어깨 말림 | 측면 전용 | -10점 |
| 4 | 어깨 비대칭 | 정면 전용 | -7점 |
| 5 | 골반 기울기 | 정면 전용 | -10점 |
| 6 | 골반 전방 변위 | 측면 전용 | -13점 |
| 7 | 골반 경사 | 측면 전용 | -7점 |
| 8 | 무릎 과신전 | 측면 전용 | -7점 |
| 9 | 몸통 측방 이탈 | 정면 전용 | -7점 |
| | **합계** | | **-88점** |

**정면 최대 감점**: -51점 (거북목 -20 + 머리기울기 -7 + 어깨비대칭 -7 + 골반기울기 -10 + 몸통이탈 -7)  
**측면 최대 감점**: -57점 (거북목 -20 + 어깨말림 -10 + 골반전방변위 -13 + 골반경사 -7 + 무릎과신전 -7)
