# RB-WELD-01 시뮬레이션 데이터 설명서

실제 설비에서 센서 데이터를 수집할 수 없어, 백엔드 디지털 트윈(`DigitalTwinService`)이
용접 로봇 1호기(`RB-WELD-01`)에 대해 만들어내는 텔레메트리 생성 로직을 그대로 재현한
시뮬레이터 2개로 데이터를 생성했다. 이 문서는 그 산출물인 CSV 2종의 컬럼과 생성 방식,
가정치를 정리한다.

| CSV | 생성 스크립트 | 데이터 단위 | 검증 대상 모델 |
|---|---|---|---|
| `rb_weld_01_timeline.csv` | `simulate_rb_weld_01.py` | 순간(포인트) | `robot_anomaly_agent_v2.joblib` |
| `weld_quality_seams.csv` | `simulate_weld_quality.py` | 시임(seam, 용접 1회 구간) | `weld_quality_agent_v1.joblib` |

두 모델은 대상이 다르다: `robot_anomaly`는 **설비가 지금 이상 동작 중인지**, `weld_quality`는
**방금 끝난 용접 결과물이 불량 위험이 있는지**를 판단한다.

---

## 1. `rb_weld_01_timeline.csv` — 설비 이상탐지 (포인트 단위)

### 생성 방법
```bash
cd 빅프/ai/robot_anomaly_agent
python simulate_rb_weld_01.py --csv rb_weld_01_timeline.csv
```
옵션: `--seconds-per-scenario`(시나리오당 구간 길이, 기본 30), `--step`(샘플 간격, 기본 5초).

### 생성 로직
`DigitalTwinService.generateTelemetry()`의 asset index 0(RB-WELD-01) 분기를 그대로 옮김.
- 정상값: `sin(t*0.72)` 사인파를 기준으로 7개 센서를 흔듦 (예: `voltage = 27.8 + wave*0.7`)
- 이상값: `NORMAL` 이후 `CURRENT_SPIKE → GAS_FLOW_DROP → AXIS_OVERLOAD → COMMUNICATION_LOSS → WELD_QUALITY_DRIFT` 순서로 각 30초씩 주입 (실제 백엔드가 시나리오 트리거 시 index 0 로봇에만 적용하는 오버라이드 값과 동일)
- 판정: `robot_anomaly_agent_v2.joblib`의 rule 5종 + IsolationForest(`general_threshold`) + 연속 확인 정책(`consecutive_count=2`, `max_gap_seconds=15`)을 `main.py`의 `/predict`와 동일하게 재현

### 컬럼 설명

| 컬럼 | 의미 |
|---|---|
| `t_sec` | 시뮬레이션 경과 시간(초). 실제 시계는 아니고 내부 타임라인 |
| `injected_scenario` | 이 시점에 주입한 시나리오 (`NORMAL`/`CURRENT_SPIKE`/`GAS_FLOW_DROP`/`AXIS_OVERLOAD`/`COMMUNICATION_LOSS`/`WELD_QUALITY_DRIFT`) — **정답 라벨** 역할 |
| `voltage`, `current_amp`, `wire_feed`, `travel_speed`, `torque_percent`, `temperature_c`, `gas_flow` | 원시 센서값 (단위는 실제 로봇 스펙 기준 전압/전류/토출속도/이동속도/토크%/온도℃/가스유량) |
| `operating_state` | `WELDING`(정상 가동) 또는 `COMMUNICATION_LOSS` 시 `OFFLINE` |
| `anomalyType` | 모델이 최종 판정한 이상 유형 (`NORMAL` / rule 5종 / `GENERAL_ANOMALY`) |
| `reasonSensor` | rule 판정 시 근거가 된 센서명 |
| `detectionSource` | `NORMAL` / `RULE`(규칙 기반 적중) / `ISOLATION_FOREST`(ML 기반 적중) |
| `candidate` | 1건이라도 이상 신호가 잡혔는지 (연속 확인 전) |
| `confirmed` | 연속 확인 정책을 통과해 최종 확정된 이상인지 — **모델의 최종 출력** |
| `severity` | `NORMAL` / `WARNING` / `CRITICAL`(통신 단절 confirmed 시) |
| `anomalyScore` | IsolationForest 이상 점수 (클수록 이상) |
| `anomalyThreshold` | 이상 판정 기준 점수 (0.05733, 모델 고정값) |
| `consecutiveCount` | 같은 이상 유형이 몇 회 연속 감지됐는지 |

### 가정 / 한계
- 노이즈 없는 **순수 결정론적 사인파**라 반복 주기(약 8.7초)가 항상 같은 패턴을 만든다. 통계적 다양성이 필요하면 노이즈를 추가해야 함 (후속 논의 참고).
- `injected_scenario`는 실측이 아닌 우리가 정한 정답이므로, `confirmed`(모델 출력)와 비교해 rule/ML이 의도한 시나리오를 제대로 잡는지 확인하는 용도로 쓴다.

---

## 2. `weld_quality_seams.csv` — 용접 품질 판정 (시임 단위)

### 생성 방법
```bash
cd 빅프/ai/robot_anomaly_agent
python simulate_weld_quality.py --csv weld_quality_seams.csv
```
옵션: `--seams-per-profile`(프로파일당 시임 수, 기본 40), `--samples-per-seam`(시임당 원시 샘플 수, 기본 60), `--seed`(재현용 시드, 기본 42).

### 생성 로직
1. 프로파일별로 시임 1회(원시 샘플 60개) 시계열을 생성 — 위 텔레메트리 공식에 프로파일마다 다른 노이즈/불안정성을 추가
2. 시임 하나를 7센서 × (mean/std/min/max) = **28개 feature**로 집계 (`weld_quality_agent_v1.joblib`이 요구하는 입력 형태와 동일)
3. 도메인 규칙으로 **우리가 정답(trueLabel)을 직접 부여** (모델을 학습시킨 실측 정답이 없기 때문)
4. `RandomForestClassifier`(500 tree, `threshold=0.35`)에 통과시켜 `modelPrediction`, `defectRiskProbability` 산출

### 프로파일 (`profile` 컬럼)

| 값 | 설명 | 의도한 정답 |
|---|---|---|
| `STABLE_NORMAL` | 노이즈 작은 정상 시임 | PASS |
| `NOISY_NORMAL` | 노이즈가 좀 더 있지만 스펙 안쪽인 시임 | 대체로 PASS (경계 케이스 포함) |
| `CURRENT_UNSTABLE` | 용접 전류가 간헐적으로 스파이크 튀는 시임 | DEFECT_RISK |
| `GAS_FLOW_UNSTABLE` | 보호가스 유량이 구간 중 일부 급락하는 시임 | DEFECT_RISK |
| `WELD_QUALITY_DRIFT_LIKE` | robot_anomaly의 `WELD_QUALITY_DRIFT` 시나리오와 동일 패턴 | DEFECT_RISK |

### 컬럼 설명

| 컬럼 | 의미 |
|---|---|
| `seam_id` | 시임 일련번호 (0~199) |
| `profile` | 위 표의 시임 프로파일 |
| `{sensor}_mean` / `_std` / `_min` / `_max` (28개) | 시임 구간 동안의 센서별 평균/표준편차/최소/최대. `current_amp_std`, `gas_flow_std`가 모델의 feature importance 상위(각 0.159, 0.087)를 차지 |
| `trueLabel` | 우리가 정의한 도메인 규칙에 따른 정답 (`PASS` / `DEFECT_RISK`) — 아래 규칙 참고 |
| `modelPrediction` | 모델이 실제로 낸 예측 |
| `defectRiskProbability` | 모델이 계산한 불량 위험 확률 (0~1) |
| `threshold` | 판정 기준 확률 (0.35, 모델 고정값) |
| `agree` | `trueLabel == modelPrediction` 여부 |

### ground truth 규칙 (`trueLabel`) — ⚠️ 가정치, 실측 스펙 확보 시 교체 필요
```
DEFECT_RISK  if  current_amp_std > 15
             or  gas_flow_std > 1.5
             or  gas_flow_min < 10
else PASS
```
순수 정상 사인파만으로도 진동 자체에서 `current_amp_std ≈ 7.8`, `gas_flow_std ≈ 0.4`가 기본으로 깔리기 때문에, 그보다 확실히 위에 있어야 "불량"으로 보자는 취지로 잡은 임의 임계값이다. 실제 용접 스펙 문서나 공정 기준이 확보되면 `simulate_weld_quality.py`의 `ground_truth_label()` 함수만 교체하면 된다.

### 이번 실행 결과 요약 (seed=42, 200 시임)

confusion matrix (규칙 `trueLabel` × 모델 `modelPrediction`):

| | 모델: DEFECT_RISK | 모델: PASS |
|---|---|---|
| **규칙: DEFECT_RISK** | 90 | 30 |
| **규칙: PASS** | 19 | 61 |

- 일치율 75.5%
- `STABLE_NORMAL`/`CURRENT_UNSTABLE`/`WELD_QUALITY_DRIFT_LIKE`(명확한 케이스)는 100% 일치
- 불일치는 전부 경계 케이스에서 발생: `NOISY_NORMAL`은 확률이 threshold(0.35) 바로 위(0.37~0.43)로 넘어가 DEFECT_RISK 판정, `GAS_FLOW_UNSTABLE`은 확률이 threshold 바로 아래(0.31~0.34)로 남아 PASS 판정 → 모델의 실제 결정 경계가 우리가 잡은 규칙 임계값과 다소 다르다는 뜻

### 가정 / 한계
- `trueLabel`은 실측이 아닌 우리가 정의한 대리 규칙 → 75.5% 일치율은 "모델 정확도"가 아니라 "우리 가설과 모델 판단이 얼마나 다른지"를 보는 참고 수치
- 시임 길이(60샘플)나 프로파일별 노이즈 강도도 임의로 잡은 값

---

## 재현성

두 스크립트 모두 `models/*.joblib`만 있으면 FastAPI 서버나 스프링 백엔드 없이 실행 가능.
`simulate_weld_quality.py`는 `--seed` 고정(기본 42)이라 같은 커맨드는 항상 같은 CSV를 만든다.
`simulate_rb_weld_01.py`는 노이즈가 없는 결정론적 사인파라 시드 개념 자체가 불필요하다.

실행 환경: 이 프로젝트의 `requirements.txt`(`numpy==2.0.2` 등)가 Python 3.13 사전빌드 wheel이 없어
venv 생성이 실패했음 — Anaconda Python(numpy/pandas/scikit-learn/joblib 기설치)으로 대신 실행함.
sklearn 버전 차이(학습 1.6.1 vs 실행 환경)로 `InconsistentVersionWarning`이 뜨는데 무시 가능.

## 다음에 개선하면 좋을 것
- `simulate_rb_weld_01.py`에 노이즈/`--runs` 옵션 추가해 통계적으로 더 다양한 데이터 생성
- `weld_quality`의 `ground_truth_label()`을 실제 용접 스펙 기준으로 교체
- 두 시뮬레이터를 하나의 파이프라인으로 묶어서 "설비 이상(robot_anomaly) → 품질 결과(weld_quality)" 인과관계를 한 번에 보여주는 통합 데이터셋 생성
