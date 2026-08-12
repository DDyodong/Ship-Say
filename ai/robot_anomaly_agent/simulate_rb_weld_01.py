"""RB-WELD-01 telemetry simulator + anomaly scorer.

실제 설비에서 데이터를 딸 수 없으므로, 백엔드의 디지털 트윈 시뮬레이터가
용접 로봇 1호기(RB-WELD-01)에 대해 만들어내는 텔레메트리 생성 로직을
그대로 재현한다.

식은 DigitalTwinService.generateTelemetry() (asset index 0, RB-WELD-01)를
그대로 옮긴 것이고, 이상 판정 로직(rule + IsolationForest + 연속 확인)은
main.py의 /predict 엔드포인트와 동일하다. FastAPI 서버나 스프링 백엔드를
띄우지 않고도 같은 모델(models/robot_anomaly_agent_v2.joblib)로 오프라인
검증을 돌리기 위한 스크립트.

사용법:
    python simulate_rb_weld_01.py
    python simulate_rb_weld_01.py --csv timeline.csv
    python simulate_rb_weld_01.py --seconds-per-scenario 60 --step 5
"""
from __future__ import annotations

import argparse
import math
from collections import defaultdict
from pathlib import Path

import joblib
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "robot_anomaly_agent_v2.joblib"

# NORMAL부터 시작해서 룰 5종을 순서대로 한 번씩 주입
SCENARIOS = [
    "NORMAL",
    "CURRENT_SPIKE",
    "GAS_FLOW_DROP",
    "AXIS_OVERLOAD",
    "COMMUNICATION_LOSS",
    "WELD_QUALITY_DRIFT",
]


def generate_sample(t: float, scenario: str) -> dict:
    """DigitalTwinService.generateTelemetry()의 asset index 0(RB-WELD-01) 분기를 그대로 재현."""
    wave = math.sin(t * 0.72)
    voltage = 27.8 + wave * 0.7
    current = 238 + wave * 11
    wire_feed = 8.6 + wave * 0.25
    travel_speed = 42 + wave * 1.8
    torque = 48 + wave * 6
    temperature = 53 + wave * 2.5
    gas_flow = 18 + wave * 0.6
    operating_state = "WELDING"

    if scenario == "CURRENT_SPIKE":
        current = 378 + wave * 15
    elif scenario == "GAS_FLOW_DROP":
        gas_flow = 4.8 + wave * 0.4
    elif scenario == "AXIS_OVERLOAD":
        torque = 96 + wave * 2
    elif scenario == "COMMUNICATION_LOSS":
        voltage = current = wire_feed = travel_speed = torque = 0.0
        operating_state = "OFFLINE"
    elif scenario == "WELD_QUALITY_DRIFT":
        voltage = 34 + wave * 4.5
        current = 180 + wave * 58

    return {
        "voltage": round(voltage, 1),
        "current_amp": round(current, 1),
        "wire_feed": round(wire_feed, 1),
        "travel_speed": round(travel_speed, 1),
        "torque_percent": round(torque, 1),
        "temperature_c": round(temperature, 1),
        "gas_flow": round(gas_flow, 1),
        "operating_state": operating_state,
    }


def load_bundle() -> dict:
    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model file not found: {MODEL_PATH}")
    bundle = joblib.load(MODEL_PATH)
    required = {"model_version", "features", "scaler", "general_anomaly_model",
                "general_threshold", "rules", "confirmation_policy"}
    missing = required.difference(bundle)
    if missing:
        raise RuntimeError(f"Model bundle is missing keys: {sorted(missing)}")
    return bundle


def classify_rule(sample: dict, rules: dict) -> tuple[str, str | None]:
    """main.py classify_rule()과 동일."""
    if sample["operating_state"].upper() == rules["COMMUNICATION_LOSS"]["operating_state"]:
        zero_count = sum(sample[k] == 0 for k in (
            "voltage", "current_amp", "wire_feed", "travel_speed",
            "torque_percent", "gas_flow"))
        if zero_count >= rules["COMMUNICATION_LOSS"]["zero_sensor_count"]:
            return "COMMUNICATION_LOSS", "operating_state"
    if sample["gas_flow"] < rules["GAS_FLOW_DROP"]["gas_flow_less_than"]:
        return "GAS_FLOW_DROP", "gas_flow"
    if sample["current_amp"] >= rules["CURRENT_SPIKE"]["current_amp_greater_than_or_equal"]:
        return "CURRENT_SPIKE", "current_amp"
    if sample["torque_percent"] >= rules["AXIS_OVERLOAD"]["torque_percent_greater_than_or_equal"]:
        return "AXIS_OVERLOAD", "torque_percent"
    quality = rules["WELD_QUALITY_DRIFT"]
    if (sample["voltage"] >= quality["voltage_greater_than_or_equal"]
            and sample["current_amp"] <= quality["current_amp_less_than_or_equal"]):
        return "WELD_QUALITY_DRIFT", "voltage,current_amp"
    return "NORMAL", None


def run_simulation(seconds_per_scenario: int, step: int) -> tuple[pd.DataFrame, dict]:
    bundle = load_bundle()
    features = bundle["features"]
    rules = bundle["rules"]
    policy = bundle["confirmation_policy"]
    asset_code = "RB-WELD-01"

    # main.py의 confirm()과 동일한 로직이지만, 실제 monotonic() 대신
    # 시뮬레이션 타임라인(sim_clock)을 써서 결정론적으로 재현한다.
    confirmation_state: dict[str, tuple[str, int, float]] = defaultdict(lambda: ("NORMAL", 0, float("-inf")))

    rows = []
    t = 0.0
    sim_clock = 0.0
    for scenario in SCENARIOS:
        for _ in range(0, max(seconds_per_scenario, step), step):
            sample = generate_sample(t, scenario)

            frame = pd.DataFrame([sample])[features]
            scaled = bundle["scaler"].transform(frame)
            score = float(-bundle["general_anomaly_model"].decision_function(scaled)[0])
            threshold = float(bundle["general_threshold"])

            anomaly_type, reason = classify_rule(sample, rules)
            source = "RULE"
            candidate = anomaly_type != "NORMAL"
            if not candidate and score >= threshold:
                anomaly_type, source, candidate = "GENERAL_ANOMALY", "ISOLATION_FOREST", True
            if not candidate:
                source = "NORMAL"

            if anomaly_type == "NORMAL":
                confirmation_state.pop(asset_code, None)
                confirmed, count = False, 0
            else:
                prev_type, prev_count, prev_time = confirmation_state[asset_code]
                count = (prev_count + 1 if prev_type == anomaly_type
                          and sim_clock - prev_time <= policy["max_gap_seconds"] else 1)
                confirmation_state[asset_code] = (anomaly_type, count, sim_clock)
                confirmed = count >= policy["consecutive_count"]

            severity = "CRITICAL" if anomaly_type == "COMMUNICATION_LOSS" and confirmed else (
                "WARNING" if confirmed else "NORMAL")

            rows.append({
                "t_sec": sim_clock, "injected_scenario": scenario, **sample,
                "anomalyType": anomaly_type, "reasonSensor": reason,
                "detectionSource": source, "candidate": candidate, "confirmed": confirmed,
                "severity": severity, "anomalyScore": round(score, 5),
                "anomalyThreshold": round(threshold, 5), "consecutiveCount": count,
            })

            t += step
            sim_clock += step

    return pd.DataFrame(rows), bundle


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=str, default=None, help="전체 타임라인을 CSV로 저장할 경로")
    parser.add_argument("--seconds-per-scenario", type=int, default=30, help="시나리오 1개당 시뮬레이션 구간 길이(초)")
    parser.add_argument("--step", type=int, default=5, help="샘플 간격(초). 백엔드의 5초 주기 기록과 동일하게 기본값 5")
    args = parser.parse_args()

    df, bundle = run_simulation(args.seconds_per_scenario, args.step)

    print(f"model_version={bundle['model_version']}  threshold={bundle['general_threshold']:.5f}")
    print(f"total samples: {len(df)}")
    print()

    confirmed = df[df["confirmed"]]
    print(f"=== confirmed anomalies: {len(confirmed)} / {len(df)} ===")
    cols = ["t_sec", "injected_scenario", "voltage", "current_amp", "gas_flow",
            "torque_percent", "anomalyType", "detectionSource", "anomalyScore", "severity"]
    if confirmed.empty:
        print("(없음)")
    else:
        print(confirmed[cols].to_string(index=False))

    print()
    print("=== 시나리오별 confirmed 비율 ===")
    print(df.groupby("injected_scenario")["confirmed"].mean().reindex(SCENARIOS).to_string())

    if args.csv:
        df.to_csv(args.csv, index=False, encoding="utf-8-sig")
        print(f"\nfull timeline saved to {args.csv}")


if __name__ == "__main__":
    main()
