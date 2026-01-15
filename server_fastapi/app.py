from __future__ import annotations

from datetime import datetime, timedelta, timezone
import asyncio
import json
import os
import random
from typing import Dict, List, Tuple

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import psycopg2
import psycopg2.extras

from .model_adapter import ModelAdapter

INTERVAL_MINUTES = 5
HISTORY_HOURS = 6
HISTORY_POINTS = int(HISTORY_HOURS * (60 / INTERVAL_MINUTES) + 1)
FORECAST_POINTS = int(os.getenv("FORECAST_POINTS", "12"))
FORECAST_INTERVAL_MINUTES = int(
    os.getenv("FORECAST_INTERVAL_MINUTES", str(INTERVAL_MINUTES))
)

app = FastAPI(title="ICU Demo API", version="0.1.0")

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://icu:icu@localhost:5432/icu_risk"
)
_db_conn = None


def get_db_conn():
    global _db_conn
    if _db_conn is None or _db_conn.closed:
        _db_conn = psycopg2.connect(DATABASE_URL)
        _db_conn.autocommit = True
    return _db_conn


def db_fetch_all(query: str, params: tuple | None = None):
    conn = get_db_conn()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query, params or ())
        return cur.fetchall()


def db_execute(query: str, params: tuple | None = None):
    conn = get_db_conn()
    with conn.cursor() as cur:
        cur.execute(query, params or ())


def ensure_tables():
    db_execute(
        """
        CREATE TABLE IF NOT EXISTS patient_alert_rules (
            patient_id TEXT NOT NULL,
            rule_id TEXT NOT NULL,
            name TEXT NOT NULL,
            risk_threshold INTEGER NOT NULL,
            sustained_duration INTEGER NOT NULL,
            rate_of_change_threshold INTEGER NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (patient_id, rule_id)
        );
        """
    )
    db_execute(
        """
        CREATE TABLE IF NOT EXISTS favorites (
            patient_id TEXT PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    db_execute(
        """
        CREATE TABLE IF NOT EXISTS alert_logs (
            id BIGSERIAL PRIMARY KEY,
            patient_id TEXT NOT NULL,
            bed_number TEXT,
            ward TEXT,
            rule_name TEXT,
            status TEXT,
            risk_at_trigger INTEGER,
            triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            acknowledged_by TEXT,
            acknowledged_at TIMESTAMPTZ
        );
        """
    )


class AlertRulePayload(BaseModel):
    id: str
    name: str
    riskThreshold: int
    sustainedDuration: int
    rateOfChangeThreshold: int
    enabled: bool


class PatientRulesPayload(BaseModel):
    rules: List[AlertRulePayload]


class FavoritePayload(BaseModel):
    favorite: bool


class AlertLogPayload(BaseModel):
    patientId: str
    bedNumber: str | None = None
    ward: str | None = None
    ruleName: str | None = None
    status: str | None = None
    riskAtTrigger: int | None = None


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def isoformat_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


FEATURE_TEMPLATES = [
    {"key": "pco2", "name": "pCO2 (Blood Gas)", "unit": "mmHg", "normal_range": (35, 45), "base_value": 40, "variance": 4, "min": 25, "max": 60, "round": 1},
    {"key": "po2", "name": "pO2 (Blood Gas)", "unit": "mmHg", "normal_range": (80, 100), "base_value": 92, "variance": 10, "min": 60, "max": 140, "round": 1},
    {"key": "alt", "name": "ALT", "unit": "U/L", "normal_range": (7, 56), "base_value": 28, "variance": 12, "min": 5, "max": 120, "round": 0},
    {"key": "albumin", "name": "Albumin", "unit": "g/dL", "normal_range": (3.5, 5.0), "base_value": 3.8, "variance": 0.3, "min": 2.5, "max": 5.5, "round": 2},
    {"key": "alp", "name": "Alkaline Phosphatase", "unit": "U/L", "normal_range": (44, 147), "base_value": 100, "variance": 20, "min": 30, "max": 220, "round": 0},
    {"key": "ast", "name": "AST", "unit": "U/L", "normal_range": (10, 40), "base_value": 30, "variance": 10, "min": 8, "max": 120, "round": 0},
    {"key": "bicarb", "name": "Bicarbonate", "unit": "mEq/L", "normal_range": (22, 29), "base_value": 24, "variance": 2.5, "min": 15, "max": 34, "round": 1},
    {"key": "bili", "name": "Bilirubin, Total", "unit": "mg/dL", "normal_range": (0.1, 1.2), "base_value": 0.8, "variance": 0.3, "min": 0, "max": 3.5, "round": 2},
    {"key": "calcium", "name": "Calcium", "unit": "mg/dL", "normal_range": (8.6, 10.2), "base_value": 9.3, "variance": 0.4, "min": 7.2, "max": 11.5, "round": 2},
    {"key": "chloride", "name": "Chloride", "unit": "mEq/L", "normal_range": (98, 106), "base_value": 102, "variance": 3.5, "min": 88, "max": 118, "round": 0},
    {"key": "creatinine", "name": "Creatinine", "unit": "mg/dL", "normal_range": (0.6, 1.3), "base_value": 1.0, "variance": 0.3, "min": 0.3, "max": 2.8, "round": 2},
    {"key": "glucose", "name": "Glucose", "unit": "mg/dL", "normal_range": (70, 140), "base_value": 110, "variance": 20, "min": 60, "max": 220, "round": 0},
    {"key": "potassium", "name": "Potassium", "unit": "mEq/L", "normal_range": (3.5, 5.1), "base_value": 4.2, "variance": 0.4, "min": 2.8, "max": 6.2, "round": 2},
    {"key": "protein", "name": "Protein, Total", "unit": "g/dL", "normal_range": (6.0, 8.3), "base_value": 6.9, "variance": 0.4, "min": 4.8, "max": 9.2, "round": 2},
    {"key": "sodium", "name": "Sodium", "unit": "mEq/L", "normal_range": (135, 145), "base_value": 138, "variance": 3, "min": 125, "max": 155, "round": 0},
    {"key": "bun", "name": "Urea Nitrogen (BUN)", "unit": "mg/dL", "normal_range": (7, 20), "base_value": 16, "variance": 4, "min": 4, "max": 40, "round": 0},
    {"key": "hematocrit", "name": "Hematocrit", "unit": "%", "normal_range": (36, 50), "base_value": 41, "variance": 3.5, "min": 25, "max": 55, "round": 1},
    {"key": "hemoglobin", "name": "Hemoglobin", "unit": "g/dL", "normal_range": (12, 17), "base_value": 13.5, "variance": 1.0, "min": 8, "max": 19, "round": 1},
    {"key": "inr", "name": "INR (PT)", "unit": "", "normal_range": (0.8, 1.2), "base_value": 1.0, "variance": 0.2, "min": 0.6, "max": 2.5, "round": 2},
    {"key": "platelet", "name": "Platelet Count", "unit": "x10^9/L", "normal_range": (150, 400), "base_value": 230, "variance": 40, "min": 80, "max": 500, "round": 0},
    {"key": "rbc", "name": "Red Blood Cells (RBC)", "unit": "x10^12/L", "normal_range": (4.2, 5.9), "base_value": 4.8, "variance": 0.4, "min": 3.0, "max": 6.5, "round": 2},
    {"key": "wbc", "name": "WBC Count", "unit": "x10^9/L", "normal_range": (4, 11), "base_value": 7.2, "variance": 2.0, "min": 2, "max": 18, "round": 1},
    {"key": "hr", "name": "Heart rate", "unit": "/min", "normal_range": (60, 100), "base_value": 85, "variance": 10, "min": 45, "max": 140, "round": 0},
    {"key": "sbp", "name": "SBP", "unit": "mmHg", "normal_range": (90, 120), "base_value": 112, "variance": 10, "min": 80, "max": 160, "round": 0},
    {"key": "dbp", "name": "DBP", "unit": "mmHg", "normal_range": (60, 80), "base_value": 72, "variance": 8, "min": 45, "max": 110, "round": 0},
    {"key": "rr", "name": "Respiratory rate", "unit": "/min", "normal_range": (12, 20), "base_value": 16, "variance": 3, "min": 8, "max": 30, "round": 0},
    {"key": "spo2", "name": "SpO2", "unit": "%", "normal_range": (95, 100), "base_value": 97, "variance": 2, "min": 88, "max": 100, "round": 0},
    {"key": "gcs_eye", "name": "GCS – eye", "unit": "score", "normal_range": (3, 4), "base_value": 4, "variance": 0, "min": 1, "max": 4, "round": 0, "discrete": True},
    {"key": "temp", "name": "Body temperature", "unit": "C", "normal_range": (36.5, 37.5), "base_value": 36.8, "variance": 0.3, "min": 35, "max": 40, "round": 1},
    {"key": "fio2", "name": "Inspired O2 fraction (FiO2)", "unit": "fraction", "normal_range": (0.21, 0.6), "base_value": 0.3, "variance": 0.05, "min": 0.21, "max": 0.8, "round": 2},
    {"key": "gcs_verbal", "name": "GCS – verbal", "unit": "score", "normal_range": (4, 5), "base_value": 5, "variance": 0, "min": 1, "max": 5, "round": 0, "discrete": True},
    {"key": "gcs_motor", "name": "GCS – motor", "unit": "score", "normal_range": (5, 6), "base_value": 6, "variance": 0, "min": 1, "max": 6, "round": 0, "discrete": True},
]

WARDS = [
    "Intensive Care Unit (ICU)",
    "Medical Intensive Care Unit (MICU)",
    "Cardiac Vascular Intensive Care Unit (CVICU)",
    "Medical/Surgical Intensive Care Unit (MICU/SICU)",
    "Surgical Intensive Care Unit (SICU)",
    "Trauma SICU (TSICU)",
    "Coronary Care Unit (CCU)",
    "Neuro Surgical Intensive Care Unit (Neuro SICU)",
]

DEPARTMENTS = [
    "감염내과",
    "호흡기내과",
    "순환기내과",
    "호흡기내과",
    "혈액종양내과",
    "외과",
    "흉부외과",
    "노인내과",
    "신장내과",
    "흉부외과",
    "산부인과",
    "흉부외과",
    "산부인과",
    "노인내과",
    "흉부외과",
    "노인내과",
]

ADMISSION_CAUSES = [
    "패혈증",
    "급성 호흡부전",
    "심근경색",
    "뇌졸중",
    "다발성 외상",
    "폐렴",
    "급성 신손상",
    "복부 수술 후 모니터링",
    "위장관 출혈",
    "중증 간부전",
]

MEDICATION_LIBRARY = [
    {"name": "Norepinephrine", "dose": "0.08 mcg/kg/min", "route": "IV"},
    {"name": "Vasopressin", "dose": "0.03 units/min", "route": "IV"},
    {"name": "Vancomycin", "dose": "1 g", "route": "IV"},
    {"name": "Meropenem", "dose": "1 g", "route": "IV"},
    {"name": "Ceftriaxone", "dose": "2 g", "route": "IV"},
    {"name": "Furosemide", "dose": "20 mg", "route": "IV"},
    {"name": "Heparin", "dose": "5,000 units", "route": "SC"},
    {"name": "Propofol", "dose": "25 mcg/kg/min", "route": "IV"},
    {"name": "Insulin", "dose": "4 units", "route": "IV"},
    {"name": "Dexamethasone", "dose": "6 mg", "route": "IV"},
    {"name": "Midazolam", "dose": "2 mg", "route": "IV"},
    {"name": "Fentanyl", "dose": "50 mcg", "route": "IV"},
    {"name": "Pantoprazole", "dose": "40 mg", "route": "IV"},
    {"name": "Acetaminophen", "dose": "650 mg", "route": "PO"},
    {"name": "Albuterol", "dose": "2.5 mg", "route": "NEB"},
    {"name": "Rocuronium", "dose": "50 mg", "route": "IV"},
]

def seeded_random(seed: int) -> float:
    value = random.Random(seed).random()
    return value - 0.5

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


FEATURE_ORDER = [f"feature{i}" for i in range(1, 37)]
MODEL = ModelAdapter(FEATURE_ORDER)
MODEL_SEQ_LEN = int(os.getenv("MODEL_SEQ_LEN", "12"))
MODEL_INTERVAL_MINUTES = int(os.getenv("MODEL_INTERVAL_MINUTES", "5"))

MODEL_COLUMN_INDEX = {
    "pco2": 3,
    "po2": 4,
    "alt": 5,
    "albumin": 6,
    "alp": 7,
    "ast": 8,
    "bicarb": 9,
    "bili": 10,
    "calcium": 11,
    "chloride": 12,
    "creatinine": 13,
    "glucose": 14,
    "potassium": 15,
    "protein": 16,
    "sodium": 17,
    "bun": 18,
    "hematocrit": 19,
    "hemoglobin": 20,
    "inr": 21,
    "platelet": 22,
    "rbc": 23,
    "wbc": 24,
    "hr": 25,
    "sbp": 26,
    "dbp": 27,
    "rr": 28,
    "spo2": 29,
    "gcs_eye": 30,
    "temp": 31,
    "fio2": 32,
    "gcs_verbal": 33,
    "gcs_motor": 34,
}


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


def random_between(min_value: float, max_value: float) -> float:
    return min_value + random.random() * (max_value - min_value)


def build_reading(template: dict) -> dict:
    value = template["base_value"] + (random.random() - 0.5) * template["variance"]
    if template.get("discrete"):
        value = round(value)
    value = clamp(value, template["min"], template["max"])
    round_to = template.get("round")
    if isinstance(round_to, int):
        value = round(value, round_to)
    return {
        "timestamp": isoformat_utc(now_utc()),
        "value": value,
        "isImputed": False,
    }


def build_readings_history(template: dict, base_time: datetime) -> List[dict]:
    readings: List[dict] = []
    for i in range(HISTORY_POINTS - 1, -1, -1):
        timestamp = base_time - timedelta(minutes=i * INTERVAL_MINUTES)
        reading = build_reading(template)
        reading["timestamp"] = isoformat_utc(timestamp)
        readings.append(reading)
    return readings


def build_risk_history(current_risk: int, trend: str, base_time: datetime) -> List[dict]:
    history: List[dict] = []
    for i in range(HISTORY_POINTS - 1, -1, -1):
        timestamp = base_time - timedelta(minutes=i * INTERVAL_MINUTES)
        if trend == "increasing":
            risk = current_risk - (i / 12) * 2.0 + random_between(-2.0, 2.0)
        elif trend == "decreasing":
            risk = current_risk + (i / 12) * 2.0 + random_between(-2.0, 2.0)
        else:
            risk = current_risk + random_between(-1.5, 1.5)
        history.append({"timestamp": isoformat_utc(timestamp), "risk": int(clamp(risk, 0, 100))})
    return history


def build_forecast_history(risk_history: List[dict]) -> List[dict]:
    if not risk_history:
        return []
    recent = risk_history[-min(len(risk_history), 6):]
    slope = (recent[-1]["risk"] - recent[0]["risk"]) / max(len(recent) - 1, 1)
    last_point = risk_history[-1]
    last_timestamp = parse_iso_utc(last_point["timestamp"])
    forecast = []
    for step in range(1, FORECAST_POINTS + 1):
        timestamp = last_timestamp + timedelta(
            minutes=FORECAST_INTERVAL_MINUTES * step
        )
        risk = int(
            clamp(last_point["risk"] + slope * step, 0, 100)
        )
        forecast.append({"timestamp": isoformat_utc(timestamp), "risk": risk})
    return forecast


def build_features(profile_index: int) -> List[dict]:
    base_time = now_utc()
    features: List[dict] = []
    for template in FEATURE_TEMPLATES:
        readings = build_readings_history(template, base_time)
        contribution = (random.random() - 0.5) * 18
        features.append(
            {
                "key": template["key"],
                "name": template["name"],
                "unit": template["unit"],
                "readings": readings,
                "normalRange": list(template["normal_range"]),
                "contribution": round(contribution, 1),
            }
        )
    return features


def build_medications(base_time: datetime, seed: int) -> List[dict]:
    rng = random.Random(seed + 101)
    count = 3 + rng.randint(0, 4)
    medications = []
    for idx in range(count):
        med = MEDICATION_LIBRARY[(seed + idx * 3) % len(MEDICATION_LIBRARY)]
        minutes_ago = 20 + idx * 55 + ((seed + idx * 11) % 20)
        timestamp = base_time - timedelta(minutes=minutes_ago)
        medications.append(
            {
                "name": med["name"],
                "dose": med["dose"],
                "route": med["route"],
                "timestamp": isoformat_utc(timestamp),
            }
        )
    return sorted(medications, key=lambda item: item["timestamp"])


def compute_out_of_range_alerts(patient: dict) -> List[dict]:
    alerts: List[dict] = []
    for feature in patient.get("features", []):
        readings = feature.get("readings") or []
        if not readings:
            continue
        latest = readings[-1]
        low, high = feature.get("normalRange", [None, None])
        if low is None or high is None:
            continue
        value = float(latest.get("value", 0))
        if value < low or value > high:
            alerts.append(
                {
                    "key": feature.get("key"),
                    "name": feature.get("name"),
                    "value": value,
                    "unit": feature.get("unit"),
                    "normalRange": [low, high],
                    "timestamp": latest.get("timestamp"),
                    "direction": "low" if value < low else "high",
                }
            )
    return alerts


def build_model_sequence(patient: dict) -> List[List[float]]:
    features = patient.get("features", [])
    if not features:
        return []

    seq_length = max(MODEL_SEQ_LEN, 1)
    interval = timedelta(minutes=MODEL_INTERVAL_MINUTES)
    end_time = now_utc()
    timeline = [
        end_time - interval * (seq_length - 1 - idx)
        for idx in range(seq_length)
    ]

    feature_readings: Dict[str, List[tuple[datetime, float]]] = {}
    for feature in features:
        key = feature.get("key")
        if not key:
            continue
        readings = []
        for reading in feature.get("readings", []):
            timestamp = parse_iso_utc(reading["timestamp"])
            readings.append((timestamp, float(reading.get("value", float("nan")))))
        readings.sort(key=lambda item: item[0])
        feature_readings[key] = readings

    sequence: List[List[float]] = []
    sex_value = 1.0 if patient.get("sex") == "M" else 0.0
    age_value = float(patient.get("age", 0))

    for target_time in timeline:
        row = [float("nan")] * 36
        row[0] = age_value
        row[1] = sex_value
        for key, readings in feature_readings.items():
            index = MODEL_COLUMN_INDEX.get(key)
            if not index or not readings:
                continue
            value = float("nan")
            for ts, val in reversed(readings):
                if ts <= target_time:
                    value = val
                    break
            row[index - 1] = value
        sequence.append(row)

    return sequence


def refresh_contributions(patient: dict) -> None:
    feature_values: Dict[str, float] = {}
    for idx, template in enumerate(FEATURE_TEMPLATES):
        readings = patient["features"][idx]["readings"]
        feature_values[template["key"]] = readings[-1]["value"] if readings else 0.0
    model_output = MODEL.explain(feature_values)

    for idx, feature in enumerate(patient["features"]):
        if not feature["readings"]:
            feature["contribution"] = 0.0
            continue
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

    available_features = [f for f in patient["features"] if f["readings"]]
    sorted_features = sorted(
        available_features, key=lambda item: item["contribution"], reverse=True
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
    ward = WARDS[index % len(WARDS)]
    department = DEPARTMENTS[index % len(DEPARTMENTS)]
    admission_cause = ADMISSION_CAUSES[index % len(ADMISSION_CAUSES)]
    base_time = now_utc()
    risk_jitter = seeded_random(index + 1) * 10
    current_risk = int(clamp(profile["current_risk"] + risk_jitter, 5, 98))
    age = int(clamp(30 + (seeded_random(index + 7) + 0.5) * 55, 18, 90))
    sex = "M" if seeded_random(index + 11) > 0 else "F"
    features = build_features(index)
    medications = build_medications(base_time, index)
    patient = {
        "icuId": str(stay_id),
        "bedNumber": bed_number,
        "ward": ward,
        "department": department,
        "admissionCause": admission_cause,
        "age": age,
        "sex": sex,
        "currentRisk": current_risk,
        "riskHistory": build_risk_history(current_risk, profile["trend"], base_time),
        "changeInLast30Min": 0,
        "lastDataUpdate": isoformat_utc(base_time),
        "imputedDataPercentage": 0,
        "topContributors": profile["top_contributors"],
        "alertStatus": profile["alert_status"],
        "features": features,
        "medications": medications,
    }
    patient["predictedRiskHistory"] = build_forecast_history(
        patient["riskHistory"]
    )
    model_sequence = build_model_sequence(patient)
    if model_sequence:
        prediction = MODEL.predict(model_sequence)
        if prediction.risk is not None:
            patient["currentRisk"] = int(clamp(prediction.risk, 0, 100))
            if patient["riskHistory"]:
                patient["riskHistory"][-1]["risk"] = patient["currentRisk"]
            patient["predictedRiskHistory"] = build_forecast_history(
                patient["riskHistory"]
            )
    refresh_contributions(patient)
    patient["outOfRangeAlerts"] = compute_out_of_range_alerts(patient)
    return patient


PATIENTS = [create_patient(index) for index in range(len(WARDS) * 13)]


def update_patient(patient: dict) -> None:
    risk_history = patient["riskHistory"]
    last_risk = risk_history[-1]["risk"] if risk_history else patient["currentRisk"]
    now = now_utc()

    for feature, template in zip(patient["features"], FEATURE_TEMPLATES):
        reading = build_reading(template)
        reading["timestamp"] = isoformat_utc(now)
        feature["readings"].append(reading)
        if len(feature["readings"]) > HISTORY_POINTS:
            feature["readings"].pop(0)

    model_sequence = build_model_sequence(patient)
    prediction = MODEL.predict(model_sequence) if model_sequence else MODEL.predict([])
    risk_next = (
        int(clamp(prediction.risk, 0, 100))
        if prediction.risk is not None
        else int(clamp(last_risk + random_between(-4, 4), 0, 100))
    )

    risk_history.append({"timestamp": isoformat_utc(now), "risk": risk_next})
    if len(risk_history) > HISTORY_POINTS:
        risk_history.pop(0)

    patient["currentRisk"] = risk_next
    patient["lastDataUpdate"] = isoformat_utc(now)
    patient["imputedDataPercentage"] = 0
    patient["predictedRiskHistory"] = build_forecast_history(risk_history)

    thirty_min_index = max(len(risk_history) - 7, 0)
    past_risk = risk_history[thirty_min_index]["risk"] if risk_history else risk_next
    patient["changeInLast30Min"] = int(risk_next - past_risk)
    refresh_contributions(patient)
    patient["outOfRangeAlerts"] = compute_out_of_range_alerts(patient)


@app.on_event("startup")
async def start_updater() -> None:
    import asyncio

    ensure_tables()

    async def loop() -> None:
        while True:
            for patient in PATIENTS:
                update_patient(patient)
            await asyncio.sleep(1)

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


@app.get("/api/patient-alert-rules")
def get_patient_alert_rules() -> dict:
    rows = db_fetch_all(
        """
        SELECT patient_id, rule_id, name, risk_threshold, sustained_duration,
               rate_of_change_threshold, enabled
        FROM patient_alert_rules
        """
    )
    rules_by_patient: Dict[str, List[dict]] = {}
    for row in rows:
        rules_by_patient.setdefault(row["patient_id"], []).append(
            {
                "id": row["rule_id"],
                "name": row["name"],
                "riskThreshold": row["risk_threshold"],
                "sustainedDuration": row["sustained_duration"],
                "rateOfChangeThreshold": row["rate_of_change_threshold"],
                "enabled": row["enabled"],
            }
        )
    return rules_by_patient


@app.put("/api/patient-alert-rules/{icu_id}")
def upsert_patient_alert_rules(
    icu_id: str, payload: PatientRulesPayload
) -> dict:
    db_execute("DELETE FROM patient_alert_rules WHERE patient_id = %s", (icu_id,))
    for rule in payload.rules:
        db_execute(
            """
            INSERT INTO patient_alert_rules (
                patient_id, rule_id, name, risk_threshold, sustained_duration,
                rate_of_change_threshold, enabled
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                icu_id,
                rule.id,
                rule.name,
                rule.riskThreshold,
                rule.sustainedDuration,
                rule.rateOfChangeThreshold,
                rule.enabled,
            ),
        )
    return {"status": "ok"}


@app.get("/api/favorites")
def get_favorites() -> List[str]:
    rows = db_fetch_all("SELECT patient_id FROM favorites")
    return [row["patient_id"] for row in rows]


@app.post("/api/favorites/{icu_id}")
def toggle_favorite(icu_id: str, payload: FavoritePayload) -> dict:
    if payload.favorite:
        db_execute(
            "INSERT INTO favorites (patient_id) VALUES (%s) ON CONFLICT DO NOTHING",
            (icu_id,),
        )
    else:
        db_execute("DELETE FROM favorites WHERE patient_id = %s", (icu_id,))
    return {"status": "ok"}


@app.get("/api/alert-logs")
def get_alert_logs(limit: int = 100) -> List[dict]:
    rows = db_fetch_all(
        """
        SELECT id, patient_id, bed_number, ward, rule_name, status,
               risk_at_trigger, triggered_at, acknowledged_by, acknowledged_at
        FROM alert_logs
        ORDER BY triggered_at DESC
        LIMIT %s
        """,
        (limit,),
    )
    return [
        {
            "id": row["id"],
            "patientId": row["patient_id"],
            "bedNumber": row["bed_number"],
            "ward": row["ward"],
            "ruleName": row["rule_name"],
            "status": row["status"],
            "riskAtTrigger": row["risk_at_trigger"],
            "timestamp": row["triggered_at"],
            "acknowledgedBy": row["acknowledged_by"],
            "acknowledgedAt": row["acknowledged_at"],
        }
        for row in rows
    ]


@app.post("/api/alert-logs")
def create_alert_log(payload: AlertLogPayload) -> dict:
    db_execute(
        """
        INSERT INTO alert_logs (
            patient_id, bed_number, ward, rule_name, status, risk_at_trigger
        ) VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            payload.patientId,
            payload.bedNumber,
            payload.ward,
            payload.ruleName,
            payload.status,
            payload.riskAtTrigger,
        ),
    )
    return {"status": "ok"}


@app.get("/api/feature-order")
def get_feature_order() -> List[str]:
    return FEATURE_ORDER


@app.get("/api/stream/patients")
async def stream_patients():
    async def event_generator():
        while True:
            payload = json.dumps(PATIENTS, ensure_ascii=False)
            yield f"data: {payload}\n\n"
            await asyncio.sleep(1)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=headers,
    )
