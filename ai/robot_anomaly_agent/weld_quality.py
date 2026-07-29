from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


router = APIRouter(prefix="/weld-quality", tags=["Weld Quality Agent"])

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = Path(
    os.getenv(
        "WELD_QUALITY_MODEL_PATH",
        BASE_DIR / "models" / "weld_quality_agent_v1.joblib",
    )
)


class WeldQualityRequest(BaseModel):
    features: dict[str, float] = Field(
        ...,
        description="용접 실행 구간을 집계한 특성. /weld-quality/model-info의 featureNames를 사용합니다.",
    )


class WeldQualityResponse(BaseModel):
    prediction: str
    defectRiskProbability: float
    qualityScore: float
    threshold: float
    requiresReinspection: bool
    requiresRework: bool
    defectType: str | None
    probableCause: str | None
    modelVersion: str


class WeldQualityRuntime:
    def __init__(self) -> None:
        self.package: Any = None
        self.model: Any = None
        self.feature_names: list[str] = []
        self.threshold: float = 0.35
        self.model_version: str = "v1"
        self.load_error: str | None = None
        self._load()

    def _load(self) -> None:
        try:
            if not MODEL_PATH.exists():
                raise FileNotFoundError(f"모델 파일을 찾을 수 없습니다: {MODEL_PATH}")

            self.package = joblib.load(MODEL_PATH)

            if isinstance(self.package, dict):
                self.model = self._first_value(
                    self.package,
                    (
                        "model",
                        "trained_model",
                        "final_quality_model",
                        "quality_risk_model",
                        "threshold_model",
                    ),
                )
                raw_features = self._first_value(
                    self.package,
                    ("feature_columns", "feature_names", "features", "input_features"),
                    required=False,
                )
                raw_threshold = self._first_value(
                    self.package,
                    ("threshold", "final_threshold", "decision_threshold"),
                    required=False,
                )
                raw_version = self._first_value(
                    self.package,
                    ("model_version", "version"),
                    required=False,
                )
            else:
                self.model = self.package
                raw_features = None
                raw_threshold = None
                raw_version = None

            if self.model is None or not hasattr(self.model, "predict"):
                raise ValueError("joblib 파일에서 학습 모델을 찾지 못했습니다.")

            if raw_features is None and hasattr(self.model, "feature_names_in_"):
                raw_features = list(self.model.feature_names_in_)

            if raw_features is None:
                raise ValueError(
                    "모델 입력 특성명이 없습니다. Colab 저장 패키지에 feature_columns를 포함해야 합니다."
                )

            self.feature_names = [str(name) for name in raw_features]
            self.threshold = float(raw_threshold if raw_threshold is not None else 0.35)
            self.model_version = str(raw_version if raw_version is not None else "v1")
        except Exception as exc:  # 서버 자체는 기동하고 health에서 원인을 확인할 수 있게 한다.
            self.load_error = f"{type(exc).__name__}: {exc}"

    @staticmethod
    def _first_value(
        source: dict[str, Any],
        keys: tuple[str, ...],
        *,
        required: bool = True,
    ) -> Any:
        for key in keys:
            if key in source:
                return source[key]
        if required:
            raise KeyError(f"필수 키가 없습니다: {', '.join(keys)}")
        return None

    @property
    def loaded(self) -> bool:
        return self.model is not None and self.load_error is None

    def predict(self, values: dict[str, float]) -> WeldQualityResponse:
        if not self.loaded:
            raise HTTPException(
                status_code=503,
                detail=f"Weld Quality 모델을 사용할 수 없습니다: {self.load_error}",
            )

        missing = [name for name in self.feature_names if name not in values]
        if missing:
            raise HTTPException(
                status_code=422,
                detail={"message": "필수 입력 특성이 누락되었습니다.", "missing": missing},
            )

        row = pd.DataFrame(
            [[float(values[name]) for name in self.feature_names]],
            columns=self.feature_names,
        )

        if hasattr(self.model, "predict_proba"):
            probabilities = self.model.predict_proba(row)[0]
            classes = list(getattr(self.model, "classes_", range(len(probabilities))))
            positive_index = self._positive_class_index(classes)
            risk_probability = float(probabilities[positive_index])
        else:
            risk_probability = float(self.model.predict(row)[0])

        risk_probability = max(0.0, min(1.0, risk_probability))
        is_defect_risk = risk_probability >= self.threshold

        return WeldQualityResponse(
            prediction="DEFECT_RISK" if is_defect_risk else "PASS",
            defectRiskProbability=round(risk_probability, 6),
            qualityScore=round((1.0 - risk_probability) * 100.0, 2),
            threshold=self.threshold,
            requiresReinspection=is_defect_risk,
            requiresRework=is_defect_risk,
            defectType="UNSPECIFIED_RISK" if is_defect_risk else None,
            probableCause=None,
            modelVersion=self.model_version,
        )

    @staticmethod
    def _positive_class_index(classes: list[Any]) -> int:
        positive_values = {1, True, "1", "DEFECT_RISK", "RISK", "FAIL"}
        for index, value in enumerate(classes):
            if value in positive_values or str(value).upper() in positive_values:
                return index
        return len(classes) - 1


runtime = WeldQualityRuntime()


@router.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "UP" if runtime.loaded else "DEGRADED",
        "agent": "WeldQualityAgent",
        "modelLoaded": runtime.loaded,
        "modelVersion": runtime.model_version,
        "error": runtime.load_error,
    }


@router.get("/model-info")
def model_info() -> dict[str, Any]:
    return {
        "agent": "WeldQualityAgent",
        "modelLoaded": runtime.loaded,
        "modelVersion": runtime.model_version,
        "threshold": runtime.threshold,
        "featureCount": len(runtime.feature_names),
        "featureNames": runtime.feature_names,
        "outputs": [
            "qualityScore",
            "defectRiskProbability",
            "prediction",
            "requiresReinspection",
            "requiresRework",
        ],
        "scope": "시뮬레이션 센서 데이터 기반 용접 품질 위험 이진 판정",
        "limitation": "현재 모델은 실제 불량 유형과 원인을 직접 분류하지 않습니다.",
        "error": runtime.load_error,
    }


@router.post("/predict", response_model=WeldQualityResponse)
def predict(request: WeldQualityRequest) -> WeldQualityResponse:
    return runtime.predict(request.features)
