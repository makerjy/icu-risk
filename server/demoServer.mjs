import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.DEMO_PORT || 4173);
const INTERVAL_MINUTES = 5;
const HISTORY_HOURS = 6;
const HISTORY_POINTS = HISTORY_HOURS * (60 / INTERVAL_MINUTES) + 1;

const FEATURE_TEMPLATES = [
  { key: "pco2", name: "pCO2 (Blood Gas)", unit: "mmHg", normalRange: [35, 45], baseValue: 42, variance: 8, min: 20, max: 70, round: 1 },
  { key: "po2", name: "pO2 (Blood Gas)", unit: "mmHg", normalRange: [80, 100], baseValue: 92, variance: 20, min: 50, max: 140, round: 1 },
  { key: "alt", name: "ALT", unit: "U/L", normalRange: [7, 56], baseValue: 38, variance: 30, min: 5, max: 200, round: 0 },
  { key: "albumin", name: "Albumin", unit: "g/dL", normalRange: [3.5, 5.0], baseValue: 3.2, variance: 0.8, min: 1.8, max: 5.5, round: 2 },
  { key: "alp", name: "Alkaline Phosphatase", unit: "U/L", normalRange: [44, 147], baseValue: 110, variance: 60, min: 30, max: 300, round: 0 },
  { key: "ast", name: "AST", unit: "U/L", normalRange: [10, 40], baseValue: 46, variance: 30, min: 5, max: 200, round: 0 },
  { key: "bicarb", name: "Bicarbonate", unit: "mEq/L", normalRange: [22, 29], baseValue: 24, variance: 6, min: 12, max: 36, round: 1 },
  { key: "bili", name: "Bilirubin, Total", unit: "mg/dL", normalRange: [0.1, 1.2], baseValue: 1.1, variance: 1.0, min: 0, max: 5, round: 2 },
  { key: "calcium", name: "Calcium", unit: "mg/dL", normalRange: [8.6, 10.2], baseValue: 9.1, variance: 1.2, min: 6.5, max: 12, round: 2 },
  { key: "chloride", name: "Chloride", unit: "mEq/L", normalRange: [98, 106], baseValue: 102, variance: 6, min: 85, max: 120, round: 0 },
  { key: "creatinine", name: "Creatinine", unit: "mg/dL", normalRange: [0.6, 1.3], baseValue: 1.4, variance: 0.6, min: 0.3, max: 4, round: 2 },
  { key: "glucose", name: "Glucose", unit: "mg/dL", normalRange: [70, 140], baseValue: 130, variance: 50, min: 50, max: 300, round: 0 },
  { key: "potassium", name: "Potassium", unit: "mEq/L", normalRange: [3.5, 5.1], baseValue: 4.4, variance: 1.1, min: 2.5, max: 6.5, round: 2 },
  { key: "protein", name: "Protein, Total", unit: "g/dL", normalRange: [6.0, 8.3], baseValue: 6.6, variance: 1.2, min: 4.0, max: 9.5, round: 2 },
  { key: "sodium", name: "Sodium", unit: "mEq/L", normalRange: [135, 145], baseValue: 138, variance: 8, min: 120, max: 160, round: 0 },
  { key: "bun", name: "Urea Nitrogen (BUN)", unit: "mg/dL", normalRange: [7, 20], baseValue: 24, variance: 12, min: 3, max: 60, round: 0 },
  { key: "hematocrit", name: "Hematocrit", unit: "%", normalRange: [36, 50], baseValue: 38, variance: 10, min: 20, max: 60, round: 1 },
  { key: "hemoglobin", name: "Hemoglobin", unit: "g/dL", normalRange: [12, 17], baseValue: 12.5, variance: 3, min: 7, max: 20, round: 1 },
  { key: "inr", name: "INR (PT)", unit: "", normalRange: [0.8, 1.2], baseValue: 1.3, variance: 0.6, min: 0.6, max: 4, round: 2 },
  { key: "platelet", name: "Platelet Count", unit: "x10^9/L", normalRange: [150, 400], baseValue: 170, variance: 90, min: 30, max: 600, round: 0 },
  { key: "rbc", name: "Red Blood Cells (RBC)", unit: "x10^12/L", normalRange: [4.2, 5.9], baseValue: 4.6, variance: 1.0, min: 2.5, max: 7, round: 2 },
  { key: "wbc", name: "WBC Count", unit: "x10^9/L", normalRange: [4, 11], baseValue: 12, variance: 6, min: 1, max: 30, round: 1 },
  { key: "hr", name: "Heart rate", unit: "/min", normalRange: [60, 100], baseValue: 96, variance: 20, min: 40, max: 160, round: 0 },
  { key: "sbp", name: "SBP", unit: "mmHg", normalRange: [90, 120], baseValue: 102, variance: 20, min: 70, max: 180, round: 0 },
  { key: "dbp", name: "DBP", unit: "mmHg", normalRange: [60, 80], baseValue: 66, variance: 14, min: 40, max: 110, round: 0 },
  { key: "rr", name: "Respiratory rate", unit: "/min", normalRange: [12, 20], baseValue: 20, variance: 8, min: 8, max: 40, round: 0 },
  { key: "spo2", name: "SpO2", unit: "%", normalRange: [95, 100], baseValue: 95, variance: 6, min: 80, max: 100, round: 0 },
  { key: "gcs_eye", name: "GCS – eye", unit: "score", normalRange: [3, 4], baseValue: 3.6, variance: 1, min: 1, max: 4, round: 0, discrete: true },
  { key: "temp", name: "Body temperature", unit: "C", normalRange: [36.5, 37.5], baseValue: 37.2, variance: 1.2, min: 35, max: 40, round: 1 },
  { key: "fio2", name: "Inspired O2 fraction (FiO2)", unit: "fraction", normalRange: [0.21, 0.6], baseValue: 0.35, variance: 0.25, min: 0.21, max: 1.0, round: 2 },
  { key: "gcs_verbal", name: "GCS – verbal", unit: "score", normalRange: [4, 5], baseValue: 4.3, variance: 1, min: 1, max: 5, round: 0, discrete: true },
  { key: "gcs_motor", name: "GCS – motor", unit: "score", normalRange: [5, 6], baseValue: 5.4, variance: 1, min: 1, max: 6, round: 0, discrete: true },
  { key: "delta_vital_hr", name: "delta_vital_hr", unit: "hr", normalRange: [0, 4], baseValue: 1.4, variance: 2.5, min: 0, max: 12, round: 1 },
  { key: "delta_lab_hr", name: "delta_lab_hr", unit: "hr", normalRange: [0, 12], baseValue: 4.5, variance: 6, min: 0, max: 24, round: 1 },
];

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

const applyRound = (value, round) =>
  typeof round === "number" ? Number(value.toFixed(round)) : value;

const buildReading = (template) => {
  let value = template.baseValue + (Math.random() - 0.5) * template.variance;

  if (template.discrete) {
    value = Math.round(value);
  }

  if (typeof template.min === "number") {
    value = Math.max(template.min, value);
  }

  if (typeof template.max === "number") {
    value = Math.min(template.max, value);
  }

  value = applyRound(value, template.round);

  return {
    timestamp: new Date(),
    value,
    isImputed: Math.random() < 0.12,
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
      risk = currentRisk - (i / 12) * 3 + randomBetween(-2.5, 2.5);
    } else if (trend === "decreasing") {
      risk = currentRisk + (i / 12) * 3 + randomBetween(-2.5, 2.5);
    } else {
      risk = currentRisk + randomBetween(-2, 2);
    }

    history.push({
      timestamp,
      risk: clamp(Math.round(risk), 0, 100),
    });
  }

  return history;
};

const buildFeatures = (profileIndex) => {
  const riskBias = [1.15, 1.0, 1.25, 0.95, 1.1, 1.05][profileIndex % 6];
  const baseTime = new Date();

  return FEATURE_TEMPLATES.map((template, idx) => {
    const bias = 1 + ((idx % 3) - 1) * 0.04;
    const baseValue =
      template.baseValue * (idx % 5 === 0 ? riskBias : bias);
    const readings = buildReadingsHistory(
      { ...template, baseValue },
      baseTime
    );
    const contribution = (Math.random() - 0.45) * 40;

    return {
      name: template.name,
      unit: template.unit,
      readings,
      normalRange: template.normalRange,
      contribution,
    };
  });
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
    if (!latest) return;
    const contribution = computeContribution(
      latest.value,
      feature.normalRange
    );
    feature.contribution = Number(contribution.toFixed(1));
  });

  const sorted = [...patient.features]
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
  const baseTime = new Date();
  const riskJitter = (seededRandom(index + 1) - 0.5) * 22;
  const currentRisk = clamp(Math.round(profile.currentRisk + riskJitter), 5, 98);
  const age = clamp(Math.round(22 + seededRandom(index + 7) * 68), 18, 90);
  const sex = seededRandom(index + 11) > 0.48 ? "M" : "F";

  return {
    icuId: String(stayId),
    bedNumber,
    age,
    sex,
    currentRisk,
    riskHistory: buildRiskHistory(currentRisk, profile.trend, baseTime),
    changeInLast30Min: 0,
    lastDataUpdate: baseTime,
    imputedDataPercentage: Math.round(randomBetween(5, 35)),
    topContributors: profile.topContributors,
    alertStatus: profile.alertStatus,
    features: buildFeatures(index),
  };
};

const patients = Array.from({ length: 26 }, (_, index) =>
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
  patient.imputedDataPercentage = clamp(
    Math.round(patient.imputedDataPercentage + randomBetween(-5, 5)),
    2,
    55
  );

  patient.features.forEach((feature, idx) => {
    const template = FEATURE_TEMPLATES[idx];
    if (!template) {
      return;
    }
    const reading = buildReading(template);
    feature.readings.push(reading);
    if (feature.readings.length > HISTORY_POINTS) {
      feature.readings.shift();
    }
  });

  refreshContributions(patient);

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
