import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.DEMO_PORT || 4173);
const INTERVAL_MINUTES = 5;
const HISTORY_HOURS = 6;
const HISTORY_POINTS = HISTORY_HOURS * (60 / INTERVAL_MINUTES) + 1;
const FORECAST_POINTS = 12;
const FORECAST_INTERVAL_MINUTES = INTERVAL_MINUTES;

const FEATURE_TEMPLATES = [
  { key: "pco2", name: "pCO2 (Blood Gas)", unit: "mmHg", normalRange: [35, 45], baseValue: 40, variance: 4, min: 25, max: 60, round: 1 },
  { key: "po2", name: "pO2 (Blood Gas)", unit: "mmHg", normalRange: [80, 100], baseValue: 92, variance: 10, min: 60, max: 140, round: 1 },
  { key: "alt", name: "ALT", unit: "U/L", normalRange: [7, 56], baseValue: 28, variance: 12, min: 5, max: 120, round: 0 },
  { key: "albumin", name: "Albumin", unit: "g/dL", normalRange: [3.5, 5.0], baseValue: 3.8, variance: 0.3, min: 2.5, max: 5.5, round: 2 },
  { key: "alp", name: "Alkaline Phosphatase", unit: "U/L", normalRange: [44, 147], baseValue: 100, variance: 20, min: 30, max: 220, round: 0 },
  { key: "ast", name: "AST", unit: "U/L", normalRange: [10, 40], baseValue: 30, variance: 10, min: 8, max: 120, round: 0 },
  { key: "bicarb", name: "Bicarbonate", unit: "mEq/L", normalRange: [22, 29], baseValue: 24, variance: 2.5, min: 15, max: 34, round: 1 },
  { key: "bili", name: "Bilirubin, Total", unit: "mg/dL", normalRange: [0.1, 1.2], baseValue: 0.8, variance: 0.3, min: 0, max: 3.5, round: 2 },
  { key: "calcium", name: "Calcium", unit: "mg/dL", normalRange: [8.6, 10.2], baseValue: 9.3, variance: 0.4, min: 7.2, max: 11.5, round: 2 },
  { key: "chloride", name: "Chloride", unit: "mEq/L", normalRange: [98, 106], baseValue: 102, variance: 3.5, min: 88, max: 118, round: 0 },
  { key: "creatinine", name: "Creatinine", unit: "mg/dL", normalRange: [0.6, 1.3], baseValue: 1.0, variance: 0.3, min: 0.3, max: 2.8, round: 2 },
  { key: "glucose", name: "Glucose", unit: "mg/dL", normalRange: [70, 140], baseValue: 110, variance: 20, min: 60, max: 220, round: 0 },
  { key: "potassium", name: "Potassium", unit: "mEq/L", normalRange: [3.5, 5.1], baseValue: 4.2, variance: 0.4, min: 2.8, max: 6.2, round: 2 },
  { key: "protein", name: "Protein, Total", unit: "g/dL", normalRange: [6.0, 8.3], baseValue: 6.9, variance: 0.4, min: 4.8, max: 9.2, round: 2 },
  { key: "sodium", name: "Sodium", unit: "mEq/L", normalRange: [135, 145], baseValue: 138, variance: 3, min: 125, max: 155, round: 0 },
  { key: "bun", name: "Urea Nitrogen (BUN)", unit: "mg/dL", normalRange: [7, 20], baseValue: 16, variance: 4, min: 4, max: 40, round: 0 },
  { key: "hematocrit", name: "Hematocrit", unit: "%", normalRange: [36, 50], baseValue: 41, variance: 3.5, min: 25, max: 55, round: 1 },
  { key: "hemoglobin", name: "Hemoglobin", unit: "g/dL", normalRange: [12, 17], baseValue: 13.5, variance: 1.0, min: 8, max: 19, round: 1 },
  { key: "inr", name: "INR (PT)", unit: "", normalRange: [0.8, 1.2], baseValue: 1.0, variance: 0.2, min: 0.6, max: 2.5, round: 2 },
  { key: "platelet", name: "Platelet Count", unit: "x10^9/L", normalRange: [150, 400], baseValue: 230, variance: 40, min: 80, max: 500, round: 0 },
  { key: "rbc", name: "Red Blood Cells (RBC)", unit: "x10^12/L", normalRange: [4.2, 5.9], baseValue: 4.8, variance: 0.4, min: 3.0, max: 6.5, round: 2 },
  { key: "wbc", name: "WBC Count", unit: "x10^9/L", normalRange: [4, 11], baseValue: 7.2, variance: 2.0, min: 2, max: 18, round: 1 },
  { key: "hr", name: "Heart rate", unit: "/min", normalRange: [60, 100], baseValue: 85, variance: 10, min: 45, max: 140, round: 0 },
  { key: "sbp", name: "SBP", unit: "mmHg", normalRange: [90, 120], baseValue: 112, variance: 10, min: 80, max: 160, round: 0 },
  { key: "dbp", name: "DBP", unit: "mmHg", normalRange: [60, 80], baseValue: 72, variance: 8, min: 45, max: 110, round: 0 },
  { key: "rr", name: "Respiratory rate", unit: "/min", normalRange: [12, 20], baseValue: 16, variance: 3, min: 8, max: 30, round: 0 },
  { key: "spo2", name: "SpO2", unit: "%", normalRange: [95, 100], baseValue: 97, variance: 2, min: 88, max: 100, round: 0 },
  { key: "gcs_eye", name: "GCS – eye", unit: "score", normalRange: [3, 4], baseValue: 4, variance: 0, min: 1, max: 4, round: 0, discrete: true },
  { key: "temp", name: "Body temperature", unit: "C", normalRange: [36.5, 37.5], baseValue: 36.8, variance: 0.3, min: 35, max: 40, round: 1 },
  { key: "fio2", name: "Inspired O2 fraction (FiO2)", unit: "fraction", normalRange: [0.21, 0.6], baseValue: 0.3, variance: 0.05, min: 0.21, max: 0.8, round: 2 },
  { key: "gcs_verbal", name: "GCS – verbal", unit: "score", normalRange: [4, 5], baseValue: 5, variance: 0, min: 1, max: 5, round: 0, discrete: true },
  { key: "gcs_motor", name: "GCS – motor", unit: "score", normalRange: [5, 6], baseValue: 6, variance: 0, min: 1, max: 6, round: 0, discrete: true },
];

const WARDS = [
  "Intensive Care Unit (ICU)",
  "Medical Intensive Care Unit (MICU)",
  "Cardiac Vascular Intensive Care Unit (CVICU)",
  "Medical/Surgical Intensive Care Unit (MICU/SICU)",
  "Surgical Intensive Care Unit (SICU)",
  "Trauma SICU (TSICU)",
  "Coronary Care Unit (CCU)",
  "Neuro Surgical Intensive Care Unit (Neuro SICU)",
];

const DEPARTMENTS = [
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
];

const ADMISSION_CAUSES = [
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
];

const MEDICATION_LIBRARY = [
  { name: "Norepinephrine", dose: "0.08 mcg/kg/min", route: "IV" },
  { name: "Vasopressin", dose: "0.03 units/min", route: "IV" },
  { name: "Vancomycin", dose: "1 g", route: "IV" },
  { name: "Meropenem", dose: "1 g", route: "IV" },
  { name: "Ceftriaxone", dose: "2 g", route: "IV" },
  { name: "Furosemide", dose: "20 mg", route: "IV" },
  { name: "Heparin", dose: "5,000 units", route: "SC" },
  { name: "Propofol", dose: "25 mcg/kg/min", route: "IV" },
  { name: "Insulin", dose: "4 units", route: "IV" },
  { name: "Dexamethasone", dose: "6 mg", route: "IV" },
  { name: "Midazolam", dose: "2 mg", route: "IV" },
  { name: "Fentanyl", dose: "50 mcg", route: "IV" },
  { name: "Pantoprazole", dose: "40 mg", route: "IV" },
  { name: "Acetaminophen", dose: "650 mg", route: "PO" },
  { name: "Albuterol", dose: "2.5 mg", route: "NEB" },
  { name: "Rocuronium", dose: "50 mg", route: "IV" },
];

const applyRound = (value, round) =>
  typeof round === "number" ? Number(value.toFixed(round)) : value;

const ALERT_PROFILES = [
  {
    currentRisk: 78,
    trend: "increasing",
    alertStatus: "rapid-increase",
    topContributors: ["BUN ↑", "SpO2 ↓", "Creatinine ↑"],
  },
  {
    currentRisk: 45,
    trend: "stable",
    alertStatus: "normal",
    topContributors: ["Age", "GCS ↓", "RR ↑"],
  },
  {
    currentRisk: 92,
    trend: "stable",
    alertStatus: "sustained-high",
    topContributors: ["SpO2 ↓↓", "pO2 ↓", "SBP ↓"],
  },
  {
    currentRisk: 28,
    trend: "decreasing",
    alertStatus: "normal",
    topContributors: ["Albumin ↓", "Age", "Platelets ↓"],
  },
  {
    currentRisk: 65,
    trend: "stable",
    alertStatus: "stale-data",
    topContributors: ["FiO2 ↑", "pCO2 ↑", "SpO2 ↓"],
  },
  {
    currentRisk: 55,
    trend: "increasing",
    alertStatus: "normal",
    topContributors: ["INR ↑", "Platelet ↓", "Bilirubin ↑"],
  },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const seededRandom = (seed) => {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
};

const randomBetween = (min, max) => min + Math.random() * (max - min);

const buildReading = (template) => {
  let value = template.baseValue + (Math.random() - 0.5) * template.variance;

  if (template.discrete) {
    value = Math.round(value);
  }

  value = clamp(value, template.min, template.max);
  value = applyRound(value, template.round);

  return {
    timestamp: new Date(),
    value,
    isImputed: false,
  };
};

const buildReadingsHistory = (template, baseTime) => {
  const readings = [];

  for (let i = HISTORY_POINTS - 1; i >= 0; i -= 1) {
    const timestamp = new Date(
      baseTime.getTime() - i * INTERVAL_MINUTES * 60 * 1000
    );
    const reading = buildReading(template);
    reading.timestamp = timestamp;
    readings.push(reading);
  }

  return readings;
};

const buildRiskHistory = (currentRisk, trend, baseTime) => {
  const history = [];

  for (let i = HISTORY_POINTS - 1; i >= 0; i -= 1) {
    const timestamp = new Date(
      baseTime.getTime() - i * INTERVAL_MINUTES * 60 * 1000
    );
    let risk = currentRisk;

    if (trend === "increasing") {
      risk = currentRisk - (i / 12) * 2.0 + randomBetween(-2, 2);
    } else if (trend === "decreasing") {
      risk = currentRisk + (i / 12) * 2.0 + randomBetween(-2, 2);
    } else {
      risk = currentRisk + randomBetween(-1.5, 1.5);
    }

    history.push({
      timestamp,
      risk: clamp(Math.round(risk), 0, 100),
    });
  }

  return history;
};

const buildForecastHistory = (riskHistory) => {
  if (!riskHistory.length) return [];
  const recent = riskHistory.slice(-Math.min(riskHistory.length, 6));
  const slope =
    (recent[recent.length - 1].risk - recent[0].risk) /
    Math.max(recent.length - 1, 1);
  const lastPoint = riskHistory[riskHistory.length - 1];
  const forecast = [];
  for (let i = 1; i <= FORECAST_POINTS; i += 1) {
    const timestamp = new Date(
      lastPoint.timestamp.getTime() + i * FORECAST_INTERVAL_MINUTES * 60 * 1000
    );
    const predictedRisk = clamp(
      Math.round(lastPoint.risk + slope * i),
      0,
      100
    );
    forecast.push({ timestamp, risk: predictedRisk });
  }
  return forecast;
};

const buildFeatures = () => {
  const baseTime = new Date();

  return FEATURE_TEMPLATES.map((template) => {
    const readings = buildReadingsHistory(template, baseTime);
    const contribution = (Math.random() - 0.5) * 18;

    return {
      key: template.key,
      name: template.name,
      unit: template.unit,
      readings,
      normalRange: template.normalRange,
      contribution,
    };
  });
};

const buildMedications = (baseTime, seed) => {
  const count = 3 + Math.floor(seededRandom(seed + 101) * 5);
  const meds = [];

  for (let i = 0; i < count; i += 1) {
    const med = MEDICATION_LIBRARY[(seed + i * 3) % MEDICATION_LIBRARY.length];
    const minutesAgo = 20 + i * 55 + ((seed + i * 11) % 20);
    meds.push({
      name: med.name,
      dose: med.dose,
      route: med.route,
      timestamp: new Date(baseTime.getTime() - minutesAgo * 60 * 1000),
    });
  }

  return meds.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
};

const computeOutOfRangeAlerts = (patient) => {
  const alerts = [];

  patient.features.forEach((feature) => {
    const lastReading = feature.readings[feature.readings.length - 1];
    if (!lastReading) {
      return;
    }
    const [low, high] = feature.normalRange;
    if (lastReading.value < low || lastReading.value > high) {
      alerts.push({
        key: feature.key,
        name: feature.name,
        value: lastReading.value,
        unit: feature.unit,
        normalRange: feature.normalRange,
        timestamp: lastReading.timestamp,
        direction: lastReading.value < low ? "low" : "high",
      });
    }
  });

  return alerts;
};

const computeContribution = (value, [low, high]) => {
  const range = Math.max(high - low, 1);
  if (value < low) {
    return ((low - value) / range) * 28;
  }
  if (value > high) {
    return ((value - high) / range) * 28;
  }
  const mid = (low + high) / 2;
  const normalized = Math.abs(value - mid) / (range / 2);
  return -Math.max(0, 1 - normalized) * 6;
};

const buildContributorLabel = (name, value, [low, high]) => {
  if (value < low) return `${name} ↓`;
  if (value > high) return `${name} ↑`;
  return name;
};

const refreshContributions = (patient) => {
  patient.features.forEach((feature) => {
    const latest = feature.readings[feature.readings.length - 1];
    if (!latest) {
      feature.contribution = 0;
      return;
    }
    const contribution = computeContribution(
      latest.value,
      feature.normalRange
    );
    feature.contribution = Number(contribution.toFixed(1));
  });

  const sorted = patient.features
    .filter((feature) => feature.readings.length > 0)
    .sort((a, b) => b.contribution - a.contribution);
  const positive = sorted.filter((feature) => feature.contribution > 0);
  const top = (positive.length ? positive : sorted)
    .slice(0, 3)
    .map((feature) =>
      buildContributorLabel(
        feature.name,
        feature.readings[feature.readings.length - 1]?.value ?? 0,
        feature.normalRange
      )
    );
  patient.topContributors = top;
};

const createPatient = (index) => {
  const profile = ALERT_PROFILES[index % ALERT_PROFILES.length];
  const stayId = 30000000 + index * 17 + 25;
  const bedNumber = `MIMIC4-ICU-${stayId}`;
  const ward = WARDS[index % WARDS.length];
  const department = DEPARTMENTS[index % DEPARTMENTS.length];
  const admissionCause = ADMISSION_CAUSES[index % ADMISSION_CAUSES.length];
  const baseTime = new Date();
  const riskJitter = seededRandom(index + 1) * 10;
  const currentRisk = clamp(Math.round(profile.currentRisk + riskJitter), 5, 98);
  const age = clamp(Math.round(30 + (seededRandom(index + 7) + 0.5) * 55), 18, 90);
  const sex = seededRandom(index + 11) > 0 ? "M" : "F";
  const medications = buildMedications(baseTime, index);

  const patient = {
    icuId: String(stayId),
    bedNumber,
    ward,
    department,
    admissionCause,
    age,
    sex,
    currentRisk,
    riskHistory: buildRiskHistory(currentRisk, profile.trend, baseTime),
    changeInLast30Min: 0,
    lastDataUpdate: baseTime,
    imputedDataPercentage: 0,
    topContributors: profile.topContributors,
    alertStatus: profile.alertStatus,
    features: buildFeatures(index),
    medications,
  };

  patient.predictedRiskHistory = buildForecastHistory(patient.riskHistory);
  patient.outOfRangeAlerts = computeOutOfRangeAlerts(patient);
  return patient;
};

const patients = Array.from({ length: WARDS.length * 13 }, (_, index) =>
  createPatient(index)
);

patients.forEach(refreshContributions);

const updatePatient = (patient) => {
  const riskHistory = patient.riskHistory;
  const lastRisk = riskHistory[riskHistory.length - 1]?.risk ?? 50;
  const riskNext = clamp(
    Math.round(lastRisk + randomBetween(-4, 4)),
    0,
    100
  );
  const now = new Date();

  riskHistory.push({ timestamp: now, risk: riskNext });
  if (riskHistory.length > HISTORY_POINTS) {
    riskHistory.shift();
  }

  patient.currentRisk = riskNext;
  patient.lastDataUpdate = now;
  patient.imputedDataPercentage = 0;

  patient.features.forEach((feature, idx) => {
    const template = FEATURE_TEMPLATES[idx];
    if (!template) {
      return;
    }
    const reading = buildReading(template);
    reading.timestamp = now;
    feature.readings.push(reading);
    if (feature.readings.length > HISTORY_POINTS) {
      feature.readings.shift();
    }
  });

  refreshContributions(patient);
  patient.outOfRangeAlerts = computeOutOfRangeAlerts(patient);
  patient.predictedRiskHistory = buildForecastHistory(patient.riskHistory);

  const thirtyMinIndex = Math.max(riskHistory.length - 7, 0);
  const pastRisk = riskHistory[thirtyMinIndex]?.risk ?? riskNext;
  patient.changeInLast30Min = Math.round(riskNext - pastRisk);
};

setInterval(() => {
  patients.forEach(updatePatient);
}, 4000);

const sendJson = (res, payload) => {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/patients") {
    sendJson(res, patients);
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/patients/")) {
    const id = url.pathname.split("/").pop();
    const patient = patients.find((item) => item.icuId === id);
    if (!patient) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    sendJson(res, patient);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`Demo server running on http://localhost:${PORT}`);
});
