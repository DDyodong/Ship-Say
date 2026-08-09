"""Weld-quality seam simulator + CSV collector.

robot_anomaly와 달리 weld_quality_agent_v1.joblib은 "순간값"이 아니라
"용접 한 시임(seam)을 처음부터 끝까지 돌린 구간 전체의 통계값"
(7개 센서 x mean/std/min/max = 28 feature)을 입력으로 받는 RandomForest
이진분류기(PASS / DEFECT_RISK, threshold=0.35)다.

이 스크립트는:
  1) RB-WELD-01 텔레메트리 생성 공식(simulate_rb_weld_01.py와 동일 베이스)에
     프로파일별로 노이즈/불안정성을 주입해 "시임 1회 = 원시 샘플 N개" 시계열을 생성
  2) 시임 단위로 28개 feature로 집계
  3) 우리가 정의한 도메인 규칙(ground truth)과 모델 예측을 함께 CSV로 저장
  4) 규칙 vs 모델 예측 confusion matrix를 출력

ground truth 규칙(가정치 — 실측 스펙이 생기면 반드시 교체할 것):
  current_amp_std > 15  OR  gas_flow_std > 1.5  OR  gas_flow_min < 10
  (참고: 순수 정상 사인파만으로도 진동 자체에서 current_amp_std ~7.8,
   gas_flow_std ~0.4 정도가 기본으로 깔림 — 그 위로 불안정성이 추가로
   얹혀야 "진짜 불량"으로 보자는 의도)

사용법:
    python simulate_weld_quality.py
    python simulate_weld_quality.py --csv weld_quality_seams.csv
    python simulate_weld_quality.py --seams-per-profile 100 --samples-per-seam 60
"""
from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "weld_quality_agent_v1.joblib"

RAW_SENSORS = ["voltage", "current_amp", "wire_feed", "travel_speed",
               "torque_percent", "temperature_c", "gas_flow"]

# 시임 프로파일: (이름, 개수, 설명) — STABLE/NOISY는 정상, 나머지는 불안정 주입
PROFILES = [
    ("STABLE_NORMAL", "노이즈 적은 정상 시임"),
    ("NOISY_NORMAL", "노이즈가 좀 더 있지만 스펙 안쪽인 정상 시임"),
    ("CURRENT_UNSTABLE", "용접 전류가 간헐적으로 튀는 불안정 시임"),
    ("GAS_FLOW_UNSTABLE", "보호가스 유량이 구간 중 일부 떨어지는 시임"),
    ("WELD_QUALITY_DRIFT_LIKE", "robot_anomaly의 WELD_QUALITY_DRIFT 시나리오와 동일한 패턴의 시임"),
]


def generate_seam(rng: np.random.Generator, profile: str, n_samples: int, step: float) -> pd.DataFrame:
    """시임 1회(용접 시작~끝) 동안의 원시 센서 시계열을 생성한다."""
    t0 = rng.uniform(0, 100)
    rows = []
    for i in range(n_samples):
        t = t0 + i * step
        wave = np.sin(t * 0.72)

        voltage = 27.8 + wave * 0.7
        current = 238 + wave * 11
        wire_feed = 8.6 + wave * 0.25
        travel_speed = 42 + wave * 1.8
        torque = 48 + wave * 6
        temperature = 53 + wave * 2.5
        gas_flow = 18 + wave * 0.6

        if profile == "STABLE_NORMAL":
            current += rng.normal(0, 2.0)
            gas_flow += rng.normal(0, 0.15)
        elif profile == "NOISY_NORMAL":
            current += rng.normal(0, 6.0)
            gas_flow += rng.normal(0, 0.8)
        elif profile == "CURRENT_UNSTABLE":
            current += rng.normal(0, 4.0)
            if rng.random() < 0.3:
                current += rng.normal(0, 45.0)  # 간헐적 스파이크
            gas_flow += rng.normal(0, 0.3)
        elif profile == "GAS_FLOW_UNSTABLE":
            current += rng.normal(0, 4.0)
            if rng.random() < 0.35:
                gas_flow = rng.uniform(3.0, 8.0)  # 유량 순간 저하
            else:
                gas_flow += rng.normal(0, 0.3)
        elif profile == "WELD_QUALITY_DRIFT_LIKE":
            voltage = 34 + wave * 4.5 + rng.normal(0, 0.5)
            current = 180 + wave * 58 + rng.normal(0, 3.0)
        else:
            raise ValueError(f"unknown profile: {profile}")

        rows.append({
            "voltage": voltage, "current_amp": current, "wire_feed": wire_feed,
            "travel_speed": travel_speed, "torque_percent": torque,
            "temperature_c": temperature, "gas_flow": gas_flow,
        })
    return pd.DataFrame(rows)


def aggregate_seam(raw: pd.DataFrame) -> dict:
    feats = {}
    for sensor in RAW_SENSORS:
        feats[f"{sensor}_mean"] = raw[sensor].mean()
        feats[f"{sensor}_std"] = raw[sensor].std(ddof=0)
        feats[f"{sensor}_min"] = raw[sensor].min()
        feats[f"{sensor}_max"] = raw[sensor].max()
    return feats


def ground_truth_label(feats: dict) -> str:
    """우리가 정의한 도메인 규칙 — 실측 스펙 확보되면 이 함수만 교체하면 됨."""
    if (feats["current_amp_std"] > 15
            or feats["gas_flow_std"] > 1.5
            or feats["gas_flow_min"] < 10):
        return "DEFECT_RISK"
    return "PASS"


def load_bundle() -> dict:
    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model file not found: {MODEL_PATH}")
    return joblib.load(MODEL_PATH)


def positive_class_index(classes: list) -> int:
    positive_values = {1, True, "1", "DEFECT_RISK", "RISK", "FAIL"}
    for index, value in enumerate(classes):
        if value in positive_values or str(value).upper() in positive_values:
            return index
    return len(classes) - 1


def run_simulation(seams_per_profile: int, samples_per_seam: int, step: float, seed: int) -> tuple[pd.DataFrame, dict]:
    bundle = load_bundle()
    model = bundle["model"]
    feature_columns = bundle["feature_columns"]
    threshold = float(bundle["threshold"])
    pos_idx = positive_class_index(list(model.classes_))

    rng = np.random.default_rng(seed)
    rows = []
    seam_id = 0
    for profile, _desc in PROFILES:
        for _ in range(seams_per_profile):
            raw = generate_seam(rng, profile, samples_per_seam, step)
            feats = aggregate_seam(raw)
            true_label = ground_truth_label(feats)

            frame = pd.DataFrame([[feats[name] for name in feature_columns]], columns=feature_columns)
            risk_probability = float(model.predict_proba(frame)[0][pos_idx])
            model_prediction = "DEFECT_RISK" if risk_probability >= threshold else "PASS"

            rows.append({
                "seam_id": seam_id, "profile": profile,
                **{k: round(v, 3) for k, v in feats.items()},
                "trueLabel": true_label, "modelPrediction": model_prediction,
                "defectRiskProbability": round(risk_probability, 4),
                "threshold": threshold, "agree": true_label == model_prediction,
            })
            seam_id += 1

    return pd.DataFrame(rows), bundle


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=str, default=None, help="시임별 결과를 저장할 CSV 경로")
    parser.add_argument("--seams-per-profile", type=int, default=40, help="프로파일당 생성할 시임 개수")
    parser.add_argument("--samples-per-seam", type=int, default=60, help="시임 1회당 원시 샘플 개수")
    parser.add_argument("--step", type=float, default=1.0, help="원시 샘플 간 시간 간격(초)")
    parser.add_argument("--seed", type=int, default=42, help="재현용 랜덤 시드")
    args = parser.parse_args()

    df, bundle = run_simulation(args.seams_per_profile, args.samples_per_seam, args.step, args.seed)

    print(f"model_version={bundle['model_version']}  threshold={bundle['threshold']}")
    print(f"total seams: {len(df)}\n")

    print("=== 프로파일별 trueLabel vs modelPrediction 분포 ===")
    print(pd.crosstab(df["profile"], df["modelPrediction"]).to_string())
    print()

    print("=== confusion matrix (trueLabel x modelPrediction) ===")
    print(pd.crosstab(df["trueLabel"], df["modelPrediction"]).to_string())
    print()

    agree_rate = df["agree"].mean() * 100
    print(f"규칙-모델 일치율(agreement rate): {agree_rate:.1f}%")

    mismatches = df[~df["agree"]]
    if not mismatches.empty:
        print(f"\n=== 불일치 {len(mismatches)}건 (규칙과 모델이 다르게 판단) ===")
        cols = ["seam_id", "profile", "current_amp_std", "gas_flow_std", "gas_flow_min",
                "trueLabel", "modelPrediction", "defectRiskProbability"]
        print(mismatches[cols].to_string(index=False))

    if args.csv:
        df.to_csv(args.csv, index=False, encoding="utf-8-sig")
        print(f"\nfull dataset saved to {args.csv}")


if __name__ == "__main__":
    main()
