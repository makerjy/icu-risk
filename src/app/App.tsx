import { useEffect, useState } from "react";
import { PatientListDashboard } from "./components/PatientListDashboard";
import { PatientDetailView } from "./components/PatientDetailView";
import { AlertManagement } from "./components/AlertManagement";
import {
  AlertRule,
  Patient,
  mockAlertRules,
  mockPatients,
} from "./data/mockData";
import { Button } from "./components/ui/button";
import { Settings, Activity, Sun, Moon } from "lucide-react";
import {
  ThemeProvider,
  useTheme,
} from "./context/ThemeContext";

type View = "dashboard" | "patient-detail" | "alert-management";

function AppContent() {
  const [currentView, setCurrentView] =
    useState<View>("dashboard");
  const [selectedPatientId, setSelectedPatientId] = useState<
    string | null
  >(null);
  const [patients, setPatients] = useState<Patient[]>(
    mockPatients
  );
  const [alertRules, setAlertRules] = useState<AlertRule[]>(
    mockAlertRules
  );
  const [liveStatus, setLiveStatus] = useState<
    "idle" | "live" | "error"
  >("idle");
  const { theme, toggleTheme } = useTheme();

  const handleSelectPatient = (icuId: string) => {
    setSelectedPatientId(icuId);
    setCurrentView("patient-detail");
  };

  const handleBackToDashboard = () => {
    setCurrentView("dashboard");
    setSelectedPatientId(null);
  };

  useEffect(() => {
    let isMounted = true;

    const computeAlertStatus = (
      patient: Patient,
      rules: AlertRule[]
    ): Patient["alertStatus"] => {
      const now = Date.now();
      const lastUpdateMs = patient.lastDataUpdate.getTime();
      if (now - lastUpdateMs > 20 * 60 * 1000) {
        return "stale-data";
      }

      let rapidRuleTriggered = false;
      let sustainedRuleTriggered = false;

      rules.forEach((rule) => {
        if (!rule.enabled) return;
        if (rule.rateOfChangeThreshold > 0) {
          const change = patient.changeInLast30Min;
          if (
            patient.currentRisk >= rule.riskThreshold &&
            change >= rule.rateOfChangeThreshold
          ) {
            rapidRuleTriggered = true;
          }
        }

        if (rule.sustainedDuration > 0) {
          const windowStart = now - rule.sustainedDuration * 60 * 1000;
          const windowPoints = patient.riskHistory.filter(
            (point) => point.timestamp.getTime() >= windowStart
          );
          if (
            windowPoints.length > 0 &&
            windowPoints.every(
              (point) => point.risk >= rule.riskThreshold
            )
          ) {
            sustainedRuleTriggered = true;
          }
        }
      });

      if (rapidRuleTriggered) return "rapid-increase";
      if (sustainedRuleTriggered) return "sustained-high";
      return "normal";
    };

    const revivePatients = (payload: Patient[]) =>
      payload.map((patient) => {
        const revived = {
          ...patient,
          lastDataUpdate: new Date(patient.lastDataUpdate),
          riskHistory: patient.riskHistory.map((point) => ({
            ...point,
            timestamp: new Date(point.timestamp),
          })),
          features: patient.features.map((feature) => ({
            ...feature,
            readings: feature.readings.map((reading) => ({
              ...reading,
              timestamp: new Date(reading.timestamp),
            })),
          })),
        };

        const riskHistory = revived.riskHistory;
        const now = Date.now();
        const thirtyMinutesAgo = now - 30 * 60 * 1000;
        const pastPoint =
          [...riskHistory]
            .reverse()
            .find(
              (point) =>
                point.timestamp.getTime() <= thirtyMinutesAgo
            ) || riskHistory[0];
        const lastRisk =
          riskHistory[riskHistory.length - 1]?.risk ??
          revived.currentRisk;
        const changeInLast30Min = Math.round(
          lastRisk - (pastPoint?.risk ?? lastRisk)
        );

        const updated = {
          ...revived,
          currentRisk: lastRisk,
          changeInLast30Min,
        };

        return {
          ...updated,
          alertStatus: computeAlertStatus(updated, alertRules),
        };
      });

    const fetchPatients = async () => {
      try {
        const response = await fetch("/api/patients", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as Patient[];
        if (isMounted) {
          setPatients(revivePatients(data));
          setLiveStatus("live");
        }
      } catch (error) {
        if (isMounted) {
          setLiveStatus("error");
        }
      }
    };

    fetchPatients();
    const interval = window.setInterval(fetchPatients, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [alertRules]);

  const selectedPatient = selectedPatientId
    ? patients.find(
        (p) => p.icuId === selectedPatientId,
      )
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-7 w-7 text-red-500" />
              <div>
                <h1 className="text-lg tracking-tight">
                  ICU 위험도 모니터
                </h1>
                <p className="text-xs text-muted-foreground">
                  임상 의사결정 지원 시스템
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant={
                  currentView === "dashboard"
                    ? "default"
                    : "ghost"
                }
                size="sm"
                onClick={() => setCurrentView("dashboard")}
                className={
                  currentView === "dashboard" ? "bg-accent" : ""
                }
              >
                대시보드
              </Button>
              <Button
                variant={
                  currentView === "alert-management"
                    ? "default"
                    : "ghost"
                }
                size="sm"
                onClick={() =>
                  setCurrentView("alert-management")
                }
                className={
                  currentView === "alert-management"
                    ? "bg-accent"
                    : ""
                }
              >
                <Settings className="h-4 w-4 mr-2" />
                알림 관리
              </Button>
              <div className="h-6 w-px bg-border mx-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={toggleTheme}
                className="gap-2"
              >
                {theme === "dark" ? (
                  <>
                    <Sun className="h-4 w-4" />
                    라이트 모드
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4" />
                    다크 모드
                  </>
                )}
              </Button>
              <div className="ml-3 px-3 py-1.5 rounded-md bg-muted border border-border text-xs font-mono">
                {new Date().toLocaleString("ko-KR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
              <div className="ml-2 px-2 py-1 rounded-md text-xs border border-border">
                {liveStatus === "live"
                  ? "LIVE"
                  : liveStatus === "error"
                  ? "OFFLINE"
                  : "SYNC"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {currentView === "dashboard" && (
          <PatientListDashboard
            patients={patients}
            onSelectPatient={handleSelectPatient}
          />
        )}

        {currentView === "patient-detail" &&
          selectedPatient && (
            <PatientDetailView
              patient={selectedPatient}
              onBack={handleBackToDashboard}
            />
          )}

        {currentView === "alert-management" && (
          <AlertManagement
            onBack={handleBackToDashboard}
            rules={alertRules}
            onUpdateRules={setAlertRules}
          />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-card mt-12">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>
              <p>
                ICU 위험도 대시보드 v1.0 · 임상 의사결정 지원
                도구
              </p>
              <p className="text-xs mt-1">
                이 시스템은 임상 판단을 지원하기 위한 위험도
                추정을 제공합니다. 임상 평가를 대체하지
                않습니다.
              </p>
            </div>
            <div className="text-right text-xs">
              <p>데이터 갱신: 5초마다</p>
              <p className="mt-1">모델 버전: 2024.1.7</p>
              <p className="mt-1 text-orange-400">
                ⚠ Mock 데이터 사용 중 (데모용)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
