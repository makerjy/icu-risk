from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Tuple

from fastapi import FastAPI

from .model_adapter import ModelAdapter

INTERVAL_MINUTES = 5
HISTORY_HOURS = 6
HISTORY_POINTS = int(HISTORY_HOURS * (60 / INTERVAL_MINUTES) + 1)

app = FastAPI(title="ICU Demo API", version="0.1.0")


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def seeded_random(seed: int) -> float:
    import math

    value = math.sin(seed * 9999) * 10000
    return value - math.floor(value)


def random_between(min_value: float, max_value: float) -> float:
    import random

    return min_value + random.random() * (max_value - min_value)


FEATURE_TEMPLATES = [
    {
        "key": "pco2",
        "name": "pCO2 (Blood Gas)",
        "unit": "mmHg",
        "normal_range": (35, 45),
        "base_value": 42,
        "variance": 8,
        "min": 20,
        "max": 70,
        "round": 1,
    },
    {
        "key": "po2",
        "name": "pO2 (Blood Gas)",
        "unit": "mmHg",
        "normal_range": (80, 100),
        "base_value": 92,
        "variance": 20,
        "min": 50,
        "max": 140,
        "round": 1,
    },
    {
        "key": "alt",
        "name": "ALT",
        "unit": "U/L",
        "normal_range": (7, 56),
        "base_value": 38,
        "variance": 30,
        "min": 5,
        "max": 200,
        "round": 0,
    },
    {
        "key": "albumin",
        "name": "Albumin",
        "unit": "g/dL",
        "normal_range": (3.5, 5.0),
        "base_value": 3.2,
        "variance": 0.8,
        "min": 1.8,
        "max": 5.5,
        "round": 2,
    },
    {
        "key": "alp",
        "name": "Alkaline Phosphatase",
        "unit": "U/L",
        "normal_range": (44, 147),
        "base_value": 110,
        "variance": 60,
        "min": 30,
        "max": 300,
        "round": 0,
    },
    {
        "key": "ast",
        "name": "AST",
        "unit": "U/L",
        "normal_range": (10, 40),
        "base_value": 46,
        "variance": 30,
        "min": 5,
        "max": 200,
        "round": 0,
    },
    {
        "key": "bicarb",
        "name": "Bicarbonate",
        "unit": "mEq/L",
        "normal_range": (22, 29),
        "base_value": 24,
        "variance": 6,
        "min": 12,
        "max": 36,
        "round": 1,
    },
    {
        "key": "bili",
        "name": "Bilirubin, Total",
        "unit": "mg/dL",
        "normal_range": (0.1, 1.2),
        "base_value": 1.1,
        "variance": 1.0,
        "min": 0,
        "max": 5,
        "round": 2,
    },
    {
        "key": "calcium",
        "name": "Calcium",
        "unit": "mg/dL",
        "normal_range": (8.6, 10.2),
        "base_value": 9.1,
        "variance": 1.2,
        "min": 6.5,
        "max": 12,
        "round": 2,
    },
    {
        "key": "chloride",
        "name": "Chloride",
        "unit": "mEq/L",
        "normal_range": (98, 106),
        "base_value": 102,
        "variance": 6,
        "min": 85,
        "max": 120,
        "round": 0,
    },
    {
        "key": "creatinine",
        "name": "Creatinine",
        "unit": "mg/dL",
        "normal_range": (0.6, 1.3),
        "base_value": 1.4,
        "variance": 0.6,
        "min": 0.3,
        "max": 4,
        "round": 2,
    },
    {
        "key": "glucose",
        "name": "Glucose",
        "unit": "mg/dL",
        "normal_range": (70, 140),
        "base_value": 130,
        "variance": 50,
        "min": 50,
        "max": 300,
        "round": 0,
    },
    {
        "key": "potassium",
        "name": "Potassium",
        "unit": "mEq/L",
        "normal_range": (3.5, 5.1),
        "base_value": 4.4,
        "variance": 1.1,
        "min": 2.5,
        "max": 6.5,
        "round": 2,
    },
    {
        "key": "protein",
        "name": "Protein, Total",
        "unit": "g/dL",
        "normal_range": (6.0, 8.3),
        "base_value": 6.6,
        "variance": 1.2,
        "min": 4.0,
        "max": 9.5,
        "round": 2,
    },
    {
        "key": "sodium",
        "name": "Sodium",
        "unit": "mEq/L",
        "normal_range": (135, 145),
        "base_value": 138,
        "variance": 8,
        "min": 120,
        "max": 160,
        "round": 0,
    },
    {
        "key": "bun",
        "name": "Urea Nitrogen (BUN)",
        "unit": "mg/dL",
        "normal_range": (7, 20),
        "base_value": 24,
        "variance": 12,
        "min": 3,
        "max": 60,
        "round": 0,
    },
    {
        "key": "hematocrit",
        "name": "Hematocrit",
        "unit": "%",
        "normal_range": (36, 50),
        "base_value": 38,
        "variance": 10,
        "min": 20,
        "max": 60,
        "round": 1,
    },
    {
        "key": "hemoglobin",
        "name": "Hemoglobin",
        "unit": "g/dL",
        "normal_range": (12, 17),
        "base_value": 12.5,
        "variance": 3,
        "min": 7,
        "max": 20,
        "round": 1,
    },
    {
        "key": "inr",
        "name": "INR (PT)",
        "unit": "",
        "normal_range": (0.8, 1.2),
        "base_value": 1.3,
        "variance": 0.6,
        "min": 0.6,
        "max": 4,
        "round": 2,
    },
    {
        "key": "platelet",
        "name": "Platelet Count",
        "unit": "x10^9/L",
        "normal_range": (150, 400),
        "base_value": 170,
        "variance": 90,
        "min": 30,
        "max": 600,
        "round": 0,
    },
    {
        "key": "rbc",
        "name": "Red Blood Cells (RBC)",
        "unit": "x10^12/L",
        "normal_range": (4.2, 5.9),
        "base_value": 4.6,
        "variance": 1.0,
        "min": 2.5,
        "max": 7,
        "round": 2,
    },
    {
        "key": "wbc",
        "name": "WBC Count",
        "unit": "x10^9/L",
        "normal_range": (4, 11),
        "base_value": 12,
        "variance": 6,
        "min": 1,
        "max": 30,
        "round": 1,
    },
    {
        "key": "hr",
        "name": "Heart rate",
        "unit": "/min",
        "normal_range": (60, 100),
        "base_value": 96,
        "variance": 20,
        "min": 40,
        "max": 160,
        "round": 0,
    },
    {
        "key": "sbp",
        "name": "SBP",
        "unit": "mmHg",
        "normal_range": (90, 120),
        "base_value": 102,
        "variance": 20,
        "min": 70,
        "max": 180,
        "round": 0,
    },
    {
        "key": "dbp",
        "name": "DBP",
        "unit": "mmHg",
        "normal_range": (60, 80),
        "base_value": 66,
        "variance": 14,
        "min": 40,
        "max": 110,
        "round": 0,
    },
    {
        "key": "rr",
        "name": "Respiratory rate",
        "unit": "/min",
        "normal_range": (12, 20),
        "base_value": 20,
        "variance": 8,
        "min": 8,
        "max": 40,
        "round": 0,
    },
    {
        "key": "spo2",
        "name": "SpO2",
        "unit": "%",
        "normal_range": (95, 100),
        "base_value": 95,
        "variance": 6,
        "min": 80,
        "max": 100,
        "round": 0,
    },
    {
        "key": "gcs_eye",
        "name": "GCS – eye",
        "unit": "score",
        "normal_range": (3, 4),
        "base_value": 3.6,
        "variance": 1,
        "min": 1,
        "max": 4,
        "round": 0,
        "discrete": True,
    },
    {
        "key": "temp",
        "name": "Body temperature",
        "unit": "C",
        "normal_range": (36.5, 37.5),
        "base_value": 37.2,
        "variance": 1.2,
        "min": 35,
        "max": 40,
        "round": 1,
    },
    {
        "key": "fio2",
        "name": "Inspired O2 fraction (FiO2)",
        "unit": "fraction",
        "normal_range": (0.21, 0.6),
        "base_value": 0.35,
        "variance": 0.25,
        "min": 0.21,
        "max": 1.0,
        "round": 2,
    },
    {
        "key": "gcs_verbal",
        "name": "GCS – verbal",
        "unit": "score",
        "normal_range": (4, 5),
        "base_value": 4.3,
        "variance": 1,
        "min": 1,
        "max": 5,
        "round": 0,
        "discrete": True,
    },
    {
        "key": "gcs_motor",
        "name": "GCS – motor",
        "unit": "score",
        "normal_range": (5, 6),
        "base_value": 5.4,
        "variance": 1,
        "min": 1,
        "max": 6,
        "round": 0,
        "discrete": True,
    },
    {
        "key": "delta_vital_hr",
        "name": "delta_vital_hr",
        "unit": "hr",
        "normal_range": (0, 4),
        "base_value": 1.4,
        "variance": 2.5,
        "min": 0,
        "max": 12,
        "round": 1,
    },
    {
        "key": "delta_lab_hr",
        "name": "delta_lab_hr",
        "unit": "hr",
        "normal_range": (0, 12),
        "base_value": 4.5,
        "variance": 6,
        "min": 0,
        "max": 24,
        "round": 1,
    },
]

ALERT_PROFILES = [
    {
        "current_risk": 78,
        "trend": "increasing",
        "alert_status": "rapid-increase",
        "top_contributors": ["BUN ↑", "SpO2 ↓", "Creatinine ↑"],
    },
    {
        "current_risk": 45,
        "trend": "stable",
        "alert_status": "normal",
        "top_contributors": ["Age", "GCS ↓", "RR ↑"],
    },
    {
        "current_risk": 92,
        "trend": "stable",
        "alert_status": "sustained-high",
        "top_contributors": ["SpO2 ↓↓", "pO2 ↓", "SBP ↓"],
    },
    {
        "current_risk": 28,
        "trend": "decreasing",
        "alert_status": "normal",
        "top_contributors": ["Albumin ↓", "Age", "Platelets ↓"],
    },
    {
        "current_risk": 65,
        "trend": "stable",
        "alert_status": "stale-data",
        "top_contributors": ["FiO2 ↑", "pCO2 ↑", "SpO2 ↓"],
    },
    {
        "current_risk": 55,
        "trend": "increasing",
        "alert_status": "normal",
        "top_contributors": ["INR ↑", "Platelet ↓", "Bilirubin ↑"],
    },
]


FEATURE_ORDER = [template["key"] for template in FEATURE_TEMPLATES]
MODEL = ModelAdapter(FEATURE_ORDER)


def compute_contribution(value: float, normal_range: Tuple[float, float]) -> float:
    low, high = normal_range
    range_value = max(high - low, 1)
    if value < low:
        return ((low - value) / range_value) * 28
    if value > high:
        return ((value - high) / range_value) * 28
    mid = (low + high) / 2
    normalized = abs(value - mid) / (range_value / 2)
    return -max(0, 1 - normalized) * 6


def build_contributor_label(
    name: str, value: float, normal_range: Tuple[float, float]
) -> str:
    low, high = normal_range
    if value < low:
        return f"{name} ↓"
    if value > high:
        return f"{name} ↑"
    return name


def build_reading(template: dict) -> dict:
    import random

    value = template["base_value"] + (random.random() - 0.5) * template["variance"]
    if template.get("discrete"):
        value = round(value)
    if "min" in template:
        value = max(template["min"], value)
    if "max" in template:
        value = min(template["max"], value)
    round_to = template.get("round")
    if isinstance(round_to, int):
        value = round(value, round_to)

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "value": value,
        "isImputed": random.random() < 0.12,
    }


def build_readings_history(template: dict, base_time: datetime) -> List[dict]:
    readings: List[dict] = []
    for i in range(HISTORY_POINTS - 1, -1, -1):
        timestamp = base_time - timedelta(minutes=i * INTERVAL_MINUTES)
        reading = build_reading(template)
        reading["timestamp"] = timestamp.isoformat()
        readings.append(reading)
    return readings


def build_risk_history(
    current_risk: int, trend: str, base_time: datetime
) -> List[dict]:
    history: List[dict] = []
    for i in range(HISTORY_POINTS - 1, -1, -1):
        timestamp = base_time - timedelta(minutes=i * INTERVAL_MINUTES)
        if trend == "increasing":
            risk = current_risk - (i / 12) * 3 + random_between(-2.5, 2.5)
        elif trend == "decreasing":
            risk = current_risk + (i / 12) * 3 + random_between(-2.5, 2.5)
        else:
            risk = current_risk + random_between(-2, 2)
        history.append({"timestamp": timestamp.isoformat(), "risk": int(clamp(risk, 0, 100))})
    return history


def build_features(profile_index: int) -> List[dict]:
    risk_bias = [1.15, 1.0, 1.25, 0.95, 1.1, 1.05][profile_index % 6]
    base_time = datetime.utcnow()
    features: List[dict] = []
    for idx, template in enumerate(FEATURE_TEMPLATES):
        bias = 1 + ((idx % 3) - 1) * 0.04
        base_value = template["base_value"] * (risk_bias if idx % 5 == 0 else bias)
        temp = {**template, "base_value": base_value}
        readings = build_readings_history(temp, base_time)
        contribution = (random_between(-0.45, 0.55)) * 40
        features.append(
            {
                "name": template["name"],
                "unit": template["unit"],
                "readings": readings,
                "normalRange": list(template["normal_range"]),
                "contribution": round(contribution, 1),
            }
        )
    return features


def refresh_contributions(patient: dict) -> None:
    feature_values = {
        template["key"]: patient["features"][idx]["readings"][-1]["value"]
        for idx, template in enumerate(FEATURE_TEMPLATES)
    }
    model_output = MODEL.explain(feature_values)

    for idx, feature in enumerate(patient["features"]):
        latest = feature["readings"][-1]
        if model_output.contributions:
            key = FEATURE_TEMPLATES[idx]["key"]
            contribution = model_output.contributions.get(
                key,
                compute_contribution(
                    float(latest["value"]), tuple(feature["normalRange"])
                ),
            )
        else:
            contribution = compute_contribution(
                float(latest["value"]), tuple(feature["normalRange"])
            )
        feature["contribution"] = round(contribution, 1)

    sorted_features = sorted(
        patient["features"], key=lambda item: item["contribution"], reverse=True
    )
    positive = [f for f in sorted_features if f["contribution"] > 0]
    top_features = positive if positive else sorted_features
    top_labels = []
    for feature in top_features[:3]:
        latest = feature["readings"][-1]
        top_labels.append(
            build_contributor_label(
                feature["name"],
                float(latest["value"]),
                tuple(feature["normalRange"]),
            )
        )
    patient["topContributors"] = top_labels


def create_patient(index: int) -> dict:
    profile = ALERT_PROFILES[index % len(ALERT_PROFILES)]
    stay_id = 30000000 + index * 17 + 25
    bed_number = f"MIMIC4-ICU-{stay_id}"
    base_time = datetime.utcnow()
    risk_jitter = (seeded_random(index + 1) - 0.5) * 22
    current_risk = int(clamp(profile["current_risk"] + risk_jitter, 5, 98))
    age = int(clamp(22 + seeded_random(index + 7) * 68, 18, 90))
    sex = "M" if seeded_random(index + 11) > 0.48 else "F"
    patient = {
        "icuId": str(stay_id),
        "bedNumber": bed_number,
        "age": age,
        "sex": sex,
        "currentRisk": current_risk,
        "riskHistory": build_risk_history(current_risk, profile["trend"], base_time),
        "changeInLast30Min": 0,
        "lastDataUpdate": base_time.isoformat(),
        "imputedDataPercentage": int(random_between(5, 35)),
        "topContributors": profile["top_contributors"],
        "alertStatus": profile["alert_status"],
        "features": build_features(index),
    }
    refresh_contributions(patient)
    return patient


PATIENTS = [create_patient(index) for index in range(26)]


def update_patient(patient: dict) -> None:
    history = patient["riskHistory"]
    last_risk = history[-1]["risk"] if history else 50
    next_risk = int(clamp(last_risk + random_between(-4, 4), 0, 100))
    now = datetime.utcnow()

    history.append({"timestamp": now.isoformat(), "risk": next_risk})
    if len(history) > HISTORY_POINTS:
        history.pop(0)

    feature_values = {
        template["key"]: patient["features"][idx]["readings"][-1]["value"]
        for idx, template in enumerate(FEATURE_TEMPLATES)
    }
    prediction = MODEL.predict(feature_values)
    if prediction.risk is not None:
        patient["currentRisk"] = int(clamp(prediction.risk, 0, 100))
    else:
        patient["currentRisk"] = next_risk
    patient["lastDataUpdate"] = now.isoformat()
    patient["imputedDataPercentage"] = int(
        clamp(patient["imputedDataPercentage"] + random_between(-5, 5), 2, 55)
    )

    for feature, template in zip(patient["features"], FEATURE_TEMPLATES):
        reading = build_reading(template)
        feature["readings"].append(reading)
        if len(feature["readings"]) > HISTORY_POINTS:
            feature["readings"].pop(0)

    thirty_min_index = max(len(history) - 7, 0)
    past_risk = history[thirty_min_index]["risk"] if history else next_risk
    patient["changeInLast30Min"] = int(next_risk - past_risk)
    refresh_contributions(patient)


@app.on_event("startup")
async def start_updater() -> None:
    import asyncio

    async def loop() -> None:
        while True:
            for patient in PATIENTS:
                update_patient(patient)
            await asyncio.sleep(4)

    asyncio.create_task(loop())


@app.get("/api/patients")
def get_patients() -> List[dict]:
    return PATIENTS


@app.get("/api/patients/{icu_id}")
def get_patient(icu_id: str) -> dict:
    for patient in PATIENTS:
        if patient["icuId"] == icu_id:
            return patient
    return {"error": "Not found"}


@app.get("/api/status")
def get_status() -> dict:
    return {"model": MODEL.status}


@app.get("/api/feature-order")
def get_feature_order() -> List[str]:
    return FEATURE_ORDER
