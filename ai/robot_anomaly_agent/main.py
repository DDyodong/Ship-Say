from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from time import monotonic
from typing import Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "robot_anomaly_agent_v2.joblib"
bundle: dict = {}
confirmation_state: dict[str, tuple[str, int, float]] = defaultdict(lambda: ("NORMAL", 0, 0.0))


def load_model_bundle() -> dict:
    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model file not found: {MODEL_PATH}")
    loaded = joblib.load(MODEL_PATH)
    required = {"model_version", "features", "scaler", "general_anomaly_model",
                "general_threshold", "rules", "confirmation_policy"}
    missing = required.difference(loaded)
    if missing:
        raise RuntimeError(f"Model bundle is missing keys: {sorted(missing)}")
    return loaded


@asynccontextmanager
async def lifespan(_: FastAPI):
    global bundle
    bundle = load_model_bundle()
    confirmation_state.clear()
    yield
    bundle = {}


app = FastAPI(title="Robot Anomaly Agent",
              description="T-Bar welding robot telemetry anomaly inference API",
              version="2.0.0", lifespan=lifespan)


class TelemetryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    asset_code: str = Field(default="UNKNOWN", alias="assetCode")
    recorded_at: datetime | None = Field(default=None, alias="recordedAt")
    operating_state: str = Field(default="WELDING", alias="operatingState")
    voltage: float
    current_amp: float
    wire_feed: float
    travel_speed: float
    torque_percent: float
    temperature_c: float
    gas_flow: float


class PredictionResponse(BaseModel):
    isAnomaly: bool
    candidate: bool
    confirmed: bool
    anomalyType: str
    severity: Literal["NORMAL", "WARNING", "CRITICAL"]
    reasonSensor: str | None
    detectionSource: Literal["NORMAL", "RULE", "ISOLATION_FOREST"]
    anomalyScore: float
    anomalyThreshold: float
    consecutiveCount: int
    modelVersion: str


def classify_rule(value: TelemetryRequest) -> tuple[str, str | None]:
    rules = bundle["rules"]
    if value.operating_state.upper() == rules["COMMUNICATION_LOSS"]["operating_state"]:
        zero_count = sum(sensor == 0 for sensor in (
            value.voltage, value.current_amp, value.wire_feed, value.travel_speed,
            value.torque_percent, value.gas_flow))
        if zero_count >= rules["COMMUNICATION_LOSS"]["zero_sensor_count"]:
            return "COMMUNICATION_LOSS", "operating_state"
    if value.gas_flow < rules["GAS_FLOW_DROP"]["gas_flow_less_than"]:
        return "GAS_FLOW_DROP", "gas_flow"
    if value.current_amp >= rules["CURRENT_SPIKE"]["current_amp_greater_than_or_equal"]:
        return "CURRENT_SPIKE", "current_amp"
    if value.torque_percent >= rules["AXIS_OVERLOAD"]["torque_percent_greater_than_or_equal"]:
        return "AXIS_OVERLOAD", "torque_percent"
    quality = rules["WELD_QUALITY_DRIFT"]
    if (value.voltage >= quality["voltage_greater_than_or_equal"]
            and value.current_amp <= quality["current_amp_less_than_or_equal"]):
        return "WELD_QUALITY_DRIFT", "voltage,current_amp"
    return "NORMAL", None


def confirm(asset_code: str, anomaly_type: str) -> tuple[bool, int]:
    if anomaly_type == "NORMAL":
        confirmation_state.pop(asset_code, None)
        return False, 0
    previous_type, previous_count, previous_time = confirmation_state[asset_code]
    now = monotonic()
    max_gap = float(bundle["confirmation_policy"]["max_gap_seconds"])
    count = previous_count + 1 if previous_type == anomaly_type and now - previous_time <= max_gap else 1
    confirmation_state[asset_code] = (anomaly_type, count, now)
    return count >= int(bundle["confirmation_policy"]["consecutive_count"]), count


@app.get("/")
def root() -> dict:
    return {"service": "Robot Anomaly Agent", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health() -> dict:
    return {"status": "UP", "agent": "RobotAnomalyAgent",
            "modelVersion": bundle.get("model_version"), "modelLoaded": bool(bundle)}


@app.get("/model-info")
def model_info() -> dict:
    return {"agent": bundle.get("agent_name"), "modelVersion": bundle.get("model_version"),
            "features": bundle.get("features"), "threshold": bundle.get("general_threshold"),
            "confirmationPolicy": bundle.get("confirmation_policy"),
            "metrics": bundle.get("metrics"),
            "datasetType": bundle.get("metrics", {}).get("dataset_type")}


@app.post("/predict", response_model=PredictionResponse)
def predict(value: TelemetryRequest) -> PredictionResponse:
    if not bundle:
        raise HTTPException(status_code=503, detail="Model is not loaded")
    frame = pd.DataFrame([value.model_dump()])[bundle["features"]]
    scaled = bundle["scaler"].transform(frame)
    score = float(-bundle["general_anomaly_model"].decision_function(scaled)[0])
    threshold = float(bundle["general_threshold"])
    anomaly_type, reason = classify_rule(value)
    source = "RULE"
    candidate = anomaly_type != "NORMAL"
    if not candidate and score >= threshold:
        anomaly_type, source, candidate = "GENERAL_ANOMALY", "ISOLATION_FOREST", True
    if not candidate:
        source = "NORMAL"
    confirmed, count = confirm(value.asset_code, anomaly_type)
    severity = "CRITICAL" if anomaly_type == "COMMUNICATION_LOSS" and confirmed else (
        "WARNING" if confirmed else "NORMAL")
    return PredictionResponse(
        isAnomaly=confirmed, candidate=candidate, confirmed=confirmed,
        anomalyType=anomaly_type, severity=severity, reasonSensor=reason,
        detectionSource=source, anomalyScore=round(score, 8),
        anomalyThreshold=threshold, consecutiveCount=count,
        modelVersion=str(bundle["model_version"]))
