// Mock data for ICU Risk Dashboard

export interface VitalReading {
  timestamp: Date;
  value: number;
  isImputed: boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  riskThreshold: number;
  sustainedDuration: number; // minutes
  rateOfChangeThreshold: number; // percentage points per 30 min
  enabled: boolean;
}

export interface Feature {
  key: string;
  name: string;
  unit: string;
  readings: VitalReading[];
  normalRange: [number, number];
  contribution: number; // Positive or negative contribution to risk
}

export interface RiskDataPoint {
  timestamp: Date;
  risk: number; // 0-100
}

export interface Patient {
  icuId: string;
  bedNumber: string;
  ward: string;
  department: string;
  age: number;
  sex: 'F' | 'M';
  currentRisk: number; // 0-100
  riskHistory: RiskDataPoint[];
  changeInLast30Min: number; // percentage points
  lastDataUpdate: Date;
  imputedDataPercentage: number; // 0-100
  topContributors: string[];
  alertStatus: 'sustained-high' | 'rapid-increase' | 'stale-data' | 'normal';
  alertRules?: AlertRule[];
  features: Feature[];
}

// Generate mock vital readings
type ReadingOptions = {
  imputationRate?: number;
  min?: number;
  max?: number;
  round?: number;
  discrete?: boolean;
};

function generateVitalReadings(
  baseValue: number,
  variance: number,
  hours: number,
  options: ReadingOptions = {}
): VitalReading[] {
  const readings: VitalReading[] = [];
  const now = new Date();
  const intervalMinutes = 5;
  const {
    imputationRate = 0.1,
    min,
    max,
    round,
    discrete = false,
  } = options;

  for (let i = hours * 12; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
    let value = baseValue + (Math.random() - 0.5) * variance;

    if (discrete) {
      value = Math.round(value);
    }

    if (typeof min === 'number') {
      value = Math.max(min, value);
    }

    if (typeof max === 'number') {
      value = Math.min(max, value);
    }

    if (typeof round === 'number') {
      value = Number(value.toFixed(round));
    }

    const isImputed = Math.random() < imputationRate;
    
    readings.push({ timestamp, value, isImputed });
  }

  return readings;
}

// Generate risk history with trend
function generateRiskHistory(
  currentRisk: number,
  hours: number,
  trend: 'increasing' | 'decreasing' | 'stable'
): RiskDataPoint[] {
  const history: RiskDataPoint[] = [];
  const now = new Date();
  const intervalMinutes = 5;

  for (let i = hours * 12; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
    let risk: number;

    if (trend === 'increasing') {
      risk = Math.max(0, currentRisk - (i / 12) * 3 + (Math.random() - 0.5) * 5);
    } else if (trend === 'decreasing') {
      risk = Math.min(100, currentRisk + (i / 12) * 3 + (Math.random() - 0.5) * 5);
    } else {
      risk = currentRisk + (Math.random() - 0.5) * 3;
    }

    history.push({ timestamp, risk: Math.max(0, Math.min(100, risk)) });
  }

  return history;
}

type FeatureTemplate = {
  key: string;
  name: string;
  unit: string;
  normalRange: [number, number];
  baseValue: number;
  variance: number;
  min?: number;
  max?: number;
  round?: number;
  discrete?: boolean;
  imputationRate?: number;
};

const FEATURE_TEMPLATES: FeatureTemplate[] = [
  { key: 'pco2', name: 'pCO2 (Blood Gas)', unit: 'mmHg', normalRange: [35, 45], baseValue: 42, variance: 8, min: 20, max: 70, round: 1 },
  { key: 'po2', name: 'pO2 (Blood Gas)', unit: 'mmHg', normalRange: [80, 100], baseValue: 92, variance: 20, min: 50, max: 140, round: 1 },
  { key: 'alt', name: 'ALT', unit: 'U/L', normalRange: [7, 56], baseValue: 38, variance: 30, min: 5, max: 200, round: 0 },
  { key: 'albumin', name: 'Albumin', unit: 'g/dL', normalRange: [3.5, 5.0], baseValue: 3.2, variance: 0.8, min: 1.8, max: 5.5, round: 2 },
  { key: 'alp', name: 'Alkaline Phosphatase', unit: 'U/L', normalRange: [44, 147], baseValue: 110, variance: 60, min: 30, max: 300, round: 0 },
  { key: 'ast', name: 'AST', unit: 'U/L', normalRange: [10, 40], baseValue: 46, variance: 30, min: 5, max: 200, round: 0 },
  { key: 'bicarb', name: 'Bicarbonate', unit: 'mEq/L', normalRange: [22, 29], baseValue: 24, variance: 6, min: 12, max: 36, round: 1 },
  { key: 'bili', name: 'Bilirubin, Total', unit: 'mg/dL', normalRange: [0.1, 1.2], baseValue: 1.1, variance: 1.0, min: 0, max: 5, round: 2 },
  { key: 'calcium', name: 'Calcium', unit: 'mg/dL', normalRange: [8.6, 10.2], baseValue: 9.1, variance: 1.2, min: 6.5, max: 12, round: 2 },
  { key: 'chloride', name: 'Chloride', unit: 'mEq/L', normalRange: [98, 106], baseValue: 102, variance: 6, min: 85, max: 120, round: 0 },
  { key: 'creatinine', name: 'Creatinine', unit: 'mg/dL', normalRange: [0.6, 1.3], baseValue: 1.4, variance: 0.6, min: 0.3, max: 4, round: 2 },
  { key: 'glucose', name: 'Glucose', unit: 'mg/dL', normalRange: [70, 140], baseValue: 130, variance: 50, min: 50, max: 300, round: 0 },
  { key: 'potassium', name: 'Potassium', unit: 'mEq/L', normalRange: [3.5, 5.1], baseValue: 4.4, variance: 1.1, min: 2.5, max: 6.5, round: 2 },
  { key: 'protein', name: 'Protein, Total', unit: 'g/dL', normalRange: [6.0, 8.3], baseValue: 6.6, variance: 1.2, min: 4.0, max: 9.5, round: 2 },
  { key: 'sodium', name: 'Sodium', unit: 'mEq/L', normalRange: [135, 145], baseValue: 138, variance: 8, min: 120, max: 160, round: 0 },
  { key: 'bun', name: 'Urea Nitrogen (BUN)', unit: 'mg/dL', normalRange: [7, 20], baseValue: 24, variance: 12, min: 3, max: 60, round: 0 },
  { key: 'hematocrit', name: 'Hematocrit', unit: '%', normalRange: [36, 50], baseValue: 38, variance: 10, min: 20, max: 60, round: 1 },
  { key: 'hemoglobin', name: 'Hemoglobin', unit: 'g/dL', normalRange: [12, 17], baseValue: 12.5, variance: 3, min: 7, max: 20, round: 1 },
  { key: 'inr', name: 'INR (PT)', unit: '', normalRange: [0.8, 1.2], baseValue: 1.3, variance: 0.6, min: 0.6, max: 4, round: 2 },
  { key: 'platelet', name: 'Platelet Count', unit: 'x10^9/L', normalRange: [150, 400], baseValue: 170, variance: 90, min: 30, max: 600, round: 0 },
  { key: 'rbc', name: 'Red Blood Cells (RBC)', unit: 'x10^12/L', normalRange: [4.2, 5.9], baseValue: 4.6, variance: 1.0, min: 2.5, max: 7, round: 2 },
  { key: 'wbc', name: 'WBC Count', unit: 'x10^9/L', normalRange: [4, 11], baseValue: 12, variance: 6, min: 1, max: 30, round: 1 },
  { key: 'hr', name: 'Heart rate', unit: '/min', normalRange: [60, 100], baseValue: 96, variance: 20, min: 40, max: 160, round: 0 },
  { key: 'sbp', name: 'SBP', unit: 'mmHg', normalRange: [90, 120], baseValue: 102, variance: 20, min: 70, max: 180, round: 0 },
  { key: 'dbp', name: 'DBP', unit: 'mmHg', normalRange: [60, 80], baseValue: 66, variance: 14, min: 40, max: 110, round: 0 },
  { key: 'rr', name: 'Respiratory rate', unit: '/min', normalRange: [12, 20], baseValue: 20, variance: 8, min: 8, max: 40, round: 0 },
  { key: 'spo2', name: 'SpO2', unit: '%', normalRange: [95, 100], baseValue: 95, variance: 6, min: 80, max: 100, round: 0 },
  { key: 'gcs_eye', name: 'GCS – eye', unit: 'score', normalRange: [3, 4], baseValue: 3.6, variance: 1, min: 1, max: 4, round: 0, discrete: true },
  { key: 'temp', name: 'Body temperature', unit: 'C', normalRange: [36.5, 37.5], baseValue: 37.2, variance: 1.2, min: 35, max: 40, round: 1 },
  { key: 'fio2', name: 'Inspired O2 fraction (FiO2)', unit: 'fraction', normalRange: [0.21, 0.6], baseValue: 0.35, variance: 0.25, min: 0.21, max: 1.0, round: 2 },
  { key: 'gcs_verbal', name: 'GCS – verbal', unit: 'score', normalRange: [4, 5], baseValue: 4.3, variance: 1, min: 1, max: 5, round: 0, discrete: true },
  { key: 'gcs_motor', name: 'GCS – motor', unit: 'score', normalRange: [5, 6], baseValue: 5.4, variance: 1, min: 1, max: 6, round: 0, discrete: true },
];

const WARDS = [
  '76병동 4호 2',
  '61병동 12호 3',
  'MICU Bed 8',
  'MICU 격리실3',
  '102병동 9호 6',
  '52병동 1호 2',
  'SICU Bed 10',
  '81병동 처치실',
  '96병동 2호 6',
  '95병동 3호 1',
  '41병동 7호 5',
  '41병동 7호 4',
  '81병동 처치실',
  '102병동 9호 6',
  'MICU 격리실1',
  '95병동 3호 23',
];

const DEPARTMENTS = [
  '감염내과',
  '호흡기내과',
  '순환기내과',
  '호흡기내과',
  '혈액종양내과',
  '외과',
  '흉부외과',
  '노인내과',
  '신장내과',
  '흉부외과',
  '산부인과',
  '흉부외과',
  '산부인과',
  '노인내과',
  '흉부외과',
  '노인내과',
];

const ALERT_PROFILES = [
  {
    currentRisk: 78,
    trend: 'increasing' as const,
    changeInLast30Min: 12,
    alertStatus: 'rapid-increase' as const,
    imputedDataPercentage: 0,
    topContributors: ['BUN ↑', 'SpO2 ↓', 'Creatinine ↑'],
  },
  {
    currentRisk: 45,
    trend: 'stable' as const,
    changeInLast30Min: -2,
    alertStatus: 'normal' as const,
    imputedDataPercentage: 0,
    topContributors: ['Age', 'GCS ↓', 'RR ↑'],
  },
  {
    currentRisk: 92,
    trend: 'stable' as const,
    changeInLast30Min: 1,
    alertStatus: 'sustained-high' as const,
    imputedDataPercentage: 0,
    topContributors: ['SpO2 ↓↓', 'pO2 ↓', 'SBP ↓'],
  },
  {
    currentRisk: 28,
    trend: 'decreasing' as const,
    changeInLast30Min: -8,
    alertStatus: 'normal' as const,
    imputedDataPercentage: 0,
    topContributors: ['Albumin ↓', 'Age', 'Platelets ↓'],
  },
  {
    currentRisk: 65,
    trend: 'stable' as const,
    changeInLast30Min: 0,
    alertStatus: 'stale-data' as const,
    imputedDataPercentage: 0,
    topContributors: ['FiO2 ↑', 'pCO2 ↑', 'SpO2 ↓'],
  },
  {
    currentRisk: 55,
    trend: 'increasing' as const,
    changeInLast30Min: 7,
    alertStatus: 'normal' as const,
    imputedDataPercentage: 0,
    topContributors: ['INR ↑', 'Platelet ↓', 'Bilirubin ↑'],
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function seededRandom(seed: number) {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

function buildFeatures(profileIndex: number): Feature[] {
  const riskBias = [1.15, 1.0, 1.25, 0.95, 1.1, 1.05][profileIndex % 6];

  return FEATURE_TEMPLATES.map((template, idx) => {
    const bias = 1 + ((idx % 3) - 1) * 0.04;
    const baseValue = template.baseValue * (idx % 5 === 0 ? riskBias : bias);
    const contribution = (Math.random() - 0.45) * 40;
    const readings = generateVitalReadings(baseValue, template.variance, 6, {
      imputationRate: template.imputationRate ?? 0.12,
      min: template.min,
      max: template.max,
      round: template.round,
      discrete: template.discrete,
    });

    return {
      key: template.key,
      name: template.name,
      unit: template.unit,
      readings,
      normalRange: template.normalRange,
      contribution,
    };
  });
}

function createPatient(index: number): Patient {
  const profile = ALERT_PROFILES[index % ALERT_PROFILES.length];
  const stayId =  + index * 17 + 25;
  const bedNumber = `ICU-${stayId}`;
  const ward = WARDS[index % WARDS.length];
  const department = DEPARTMENTS[index % DEPARTMENTS.length];
  const minutesAgoOptions = [2, 3, 5, 7, 12, 25];
  const minutesAgo = minutesAgoOptions[index % minutesAgoOptions.length];
  const riskJitter = (seededRandom(index + 1) - 0.5) * 22;
  const currentRisk = clamp(
    Math.round(profile.currentRisk + riskJitter),
    5,
    98
  );
  const changeJitter = Math.round((seededRandom(index + 42) - 0.5) * 8);
  const changeInLast30Min = profile.changeInLast30Min + changeJitter;
  const age = clamp(
    Math.round(22 + seededRandom(index + 7) * 68),
    18,
    90
  );
  const sex: 'F' | 'M' = seededRandom(index + 11) > 0.48 ? 'M' : 'F';

  return {
    icuId: String(stayId),
    bedNumber,
    ward,
    department,
    age,
    sex,
    currentRisk,
    riskHistory: generateRiskHistory(currentRisk, 6, profile.trend),
    changeInLast30Min,
    lastDataUpdate: new Date(Date.now() - minutesAgo * 60 * 1000),
    imputedDataPercentage: profile.imputedDataPercentage,
    topContributors: profile.topContributors,
    alertStatus: profile.alertStatus,
    features: buildFeatures(index),
  };
}

// Mock patients data (20 added -> total 26)
export const mockPatients: Patient[] = Array.from({ length: 26 }, (_, index) =>
  createPatient(index)
);

// Alert configuration mock data
export interface AlertPerformanceMetrics {
  falseAlarmsPerHundredPatientDays: number;
  medianLeadTimeHours: number;
  sensitivity: number;
  specificity: number;
}

export const mockAlertRules: AlertRule[] = [
  {
    id: 'rule-1',
    name: 'Sustained High Risk',
    riskThreshold: 70,
    sustainedDuration: 30,
    rateOfChangeThreshold: 0,
    enabled: true,
  },
  {
    id: 'rule-2',
    name: 'Rapid Risk Increase',
    riskThreshold: 50,
    sustainedDuration: 0,
    rateOfChangeThreshold: 10,
    enabled: true,
  },
  {
    id: 'rule-3',
    name: 'Critical Risk Level',
    riskThreshold: 85,
    sustainedDuration: 15,
    rateOfChangeThreshold: 0,
    enabled: true,
  },
];

export const mockAlertPerformance: AlertPerformanceMetrics = {
  falseAlarmsPerHundredPatientDays: 3.2,
  medianLeadTimeHours: 4.8,
  sensitivity: 0.87,
  specificity: 0.92,
};

export interface AlertLogEntry {
  id: string;
  timestamp: Date;
  bedNumber: string;
  ruleName: string;
  riskAtTrigger: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export const mockAlertLog: AlertLogEntry[] = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 15 * 60 * 1000),
    bedNumber: 'ICU-101',
    ruleName: 'Rapid Risk Increase',
    riskAtTrigger: 66,
    acknowledged: true,
    acknowledgedBy: 'Dr. Kim',
    acknowledgedAt: new Date(Date.now() - 12 * 60 * 1000),
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
    bedNumber: 'ICU-103',
    ruleName: 'Sustained High Risk',
    riskAtTrigger: 91,
    acknowledged: true,
    acknowledgedBy: 'Nurse Lee',
    acknowledgedAt: new Date(Date.now() - 40 * 60 * 1000),
  },
  {
    id: 'log-3',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    bedNumber: 'ICU-106',
    ruleName: 'Rapid Risk Increase',
    riskAtTrigger: 48,
    acknowledged: true,
    acknowledgedBy: 'Dr. Park',
    acknowledgedAt: new Date(Date.now() - 115 * 60 * 1000),
  },
  {
    id: 'log-4',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
    bedNumber: 'ICU-102',
    ruleName: 'Sustained High Risk',
    riskAtTrigger: 72,
    acknowledged: true,
    acknowledgedBy: 'Nurse Choi',
    acknowledgedAt: new Date(Date.now() - 235 * 60 * 1000),
  },
  {
    id: 'log-5',
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
    bedNumber: 'ICU-104',
    ruleName: 'Rapid Risk Increase',
    riskAtTrigger: 55,
    acknowledged: true,
    acknowledgedBy: 'Dr. Jung',
    acknowledgedAt: new Date(Date.now() - 350 * 60 * 1000),
  },
];
