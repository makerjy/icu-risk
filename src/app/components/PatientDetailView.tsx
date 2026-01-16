import { useMemo, useRef, useState } from 'react';
import { AlertRule, Patient } from '../data/mockData';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Area, ComposedChart, BarChart, Bar, Cell } from 'recharts';
import { Button } from './ui/button';
import { AlertTriangle, Circle } from 'lucide-react';
import { RiskBadge } from './RiskBadge';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';

interface PatientDetailViewProps {
  patient: Patient;
  alertRules: AlertRule[];
  onUpdateAlertRules: (rules: AlertRule[]) => void;
  onBack: () => void;
}

export function PatientDetailView({
  patient,
  alertRules,
  onUpdateAlertRules,
  onBack,
}: PatientDetailViewProps) {
  const DEMO_MODE = true;
  const [riskTab, setRiskTab] = useState<'recent' | 'daily'>('recent');
  const formatBedLabel = (bedNumber: string) => `ICU-${bedNumber.slice(-3)}`;
  const updateRule = (id: string, updates: Partial<AlertRule>) => {
    onUpdateAlertRules(
      alertRules.map((rule) =>
        rule.id === id ? { ...rule, ...updates } : rule
      )
    );
  };
  const isLongStay = (patient.lengthOfStayDays ?? 0) >= 7;
  const dailyBaseRef = useRef<{ id: string | null; baseRisk: number }>({
    id: null,
    baseRisk: 0,
  });
  if (dailyBaseRef.current.id !== patient.icuId) {
    dailyBaseRef.current = { id: patient.icuId, baseRisk: patient.currentRisk };
  }

  const dailyTrendData = useMemo(() => {
    if (!isLongStay) return [];
    const days = Math.min(14, Math.max(1, patient.lengthOfStayDays ?? 1));
    const data: Array<{
      dateLabel: string;
      dailySummary: number;
      highRiskMinutes: number;
      maxRisk: number;
    }> = [];
    const baseRisk = dailyBaseRef.current.baseRisk;
    const todayRisk = patient.currentRisk;
    const now = new Date();
    const seed = Number(String(patient.icuId).slice(-3)) || 0;
    const stableJitter = (offset: number) =>
      Math.sin((seed + offset) * 0.7) * 0.6 +
      Math.cos((seed + offset) * 0.3) * 0.4;
    const todayJitter = () =>
      (Math.sin(Date.now() / 600000) + Math.cos(Date.now() / 420000)) * 0.6;

    for (let dayOffset = days - 1; dayOffset >= 0; dayOffset -= 1) {
      const dayDate = new Date(
        now.getTime() - dayOffset * 24 * 60 * 60 * 1000
      );
      const baselineOffset =
        dayOffset === 0 ? stableJitter(dayOffset) + todayJitter() : stableJitter(dayOffset);
      const baseForDay = dayOffset === 0 ? todayRisk : baseRisk;
      const dayBaseline = Math.max(0, Math.min(100, baseForDay + baselineOffset));
      const samples: number[] = [];
      for (let hour = 0; hour < 24; hour += 1) {
        const jitter =
          Math.sin((hour + dayOffset + seed) / 2) * 0.4;
        const value = Math.max(0, Math.min(100, dayBaseline + jitter));
        samples.push(value);
      }
      const sorted = [...samples].sort((a, b) => b - a);
      const topCount = Math.max(1, Math.ceil(sorted.length * 0.1));
      const topAvg =
        sorted.slice(0, topCount).reduce((acc, v) => acc + v, 0) / topCount;
      const highRiskMinutes = samples.reduce(
        (acc, v) => acc + (v >= 70 ? 60 : 0),
        0
      );
      const maxRisk = sorted[0] ?? 0;
      data.push({
        dateLabel: format(dayDate, 'M/d', { locale: ko }),
        dailySummary: Number(topAvg.toFixed(1)),
        highRiskMinutes,
        maxRisk: Number(maxRisk.toFixed(1)),
      });
    }

    return data;
  }, [isLongStay, patient.currentRisk, patient.icuId]);

  // Prepare risk data for chart
  const buildFallbackForecast = (history: Patient['riskHistory']) => {
    if (!history.length) return [];
    const recent = history.slice(-Math.min(history.length, 6));
    const slope =
      (recent[recent.length - 1].risk - recent[0].risk) /
      Math.max(recent.length - 1, 1);
    const lastPoint = history[history.length - 1];
    const lastTs =
      lastPoint.timestamp instanceof Date
        ? lastPoint.timestamp.getTime()
        : new Date(lastPoint.timestamp).getTime();
    const points = 12;
    const intervalMinutes = 5;
    return Array.from({ length: points }, (_, idx) => {
      const step = idx + 1;
      const timestamp = new Date(
        lastTs + step * intervalMinutes * 60 * 1000
      );
      const risk = Math.max(
        0,
        Math.min(100, lastPoint.risk + slope * step)
      );
      return { timestamp, risk: Number(risk.toFixed(2)) };
    });
  };

  const riskChartData = patient.riskHistory.map((point, index) => {
    const ts = point.timestamp instanceof Date
      ? point.timestamp.getTime()
      : new Date(point.timestamp).getTime();
    return {
      index,
      timeLabel: format(new Date(ts), 'HH:mm'),
      timestamp: ts,
      risk: point.risk,
      predictedRisk: undefined as number | undefined,
      medMarker: undefined as number | undefined,
      medLabels: [] as string[],
    };
  });

  const riskChartWithMeds = [...riskChartData];
  const predictedHistory = patient.predictedRiskHistory ?? [];
  const forecastHistory =
    predictedHistory.length > 0
      ? predictedHistory
      : buildFallbackForecast(patient.riskHistory);
  if (forecastHistory.length > 0) {
    const actualPoints = riskChartWithMeds.length;
    forecastHistory.forEach((point, idx) => {
      const ts = point.timestamp instanceof Date
        ? point.timestamp.getTime()
        : new Date(point.timestamp).getTime();
      riskChartWithMeds.push({
        index: actualPoints - 1 + idx + 1,
        timeLabel: format(new Date(ts), 'HH:mm'),
        timestamp: ts,
        risk: undefined,
        predictedRisk: point.risk,
        medMarker: undefined,
        medLabels: [],
      });
    });
  }
  const timeLabelByIndex = new Map<number, string>(
    riskChartWithMeds.map((point) => [point.index, point.timeLabel])
  );
  const medLineLabels = new Set<string>();
  const medLineIndices = new Set<number>();
  patient.medications.forEach((med) => {
    const ts = med.timestamp instanceof Date
      ? med.timestamp.getTime()
      : new Date(med.timestamp).getTime();
    if (!Number.isFinite(ts) || riskChartWithMeds.length === 0) return;

    let closestIndex = 0;
    let closestDelta = Math.abs(riskChartWithMeds[0].timestamp - ts);
    for (let i = 1; i < riskChartWithMeds.length; i += 1) {
      const delta = Math.abs(riskChartWithMeds[i].timestamp - ts);
      if (delta < closestDelta) {
        closestDelta = delta;
        closestIndex = i;
      }
    }

    const target = riskChartWithMeds[closestIndex];
    target.medMarker = 98;
    const medLabel = [med.name, med.dose, med.route]
      .filter(Boolean)
      .join(' ');
    target.medLabels.push(medLabel);
    if (target.timeLabel) {
      medLineLabels.add(target.timeLabel);
    }
    medLineIndices.add(target.index);
  });

  const recentMedications = [...patient.medications]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 3);

  // Find first threshold exceedance
  const alertThreshold = DEMO_MODE ? 20 : 70;
  const thresholdExceedanceIndex = patient.riskHistory.findIndex(
    (point) => point.risk > alertThreshold
  );
  const firstExceedance = thresholdExceedanceIndex >= 0 
    ? patient.riskHistory[thresholdExceedanceIndex] 
    : null;

  // Prepare feature contribution data
  const contributionData = [...patient.features]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 10)
    .map(feature => ({
      name: feature.name,
      contribution: feature.contribution,
    }));

  const sortedFeatures = [...patient.features].sort((a, b) => {
    const lastA = a.readings[a.readings.length - 1];
    const prevA = a.readings[a.readings.length - 2];
    const lastB = b.readings[b.readings.length - 1];
    const prevB = b.readings[b.readings.length - 2];

    const rateA =
      lastA && prevA && prevA.value !== 0
        ? Math.abs((lastA.value - prevA.value) / prevA.value)
        : lastA && prevA
        ? Math.abs(lastA.value - prevA.value)
        : -1;
    const rateB =
      lastB && prevB && prevB.value !== 0
        ? Math.abs((lastB.value - prevB.value) / prevB.value)
        : lastB && prevB
        ? Math.abs(lastB.value - prevB.value)
        : -1;

    return rateB - rateA;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-mono">
            {formatBedLabel(patient.bedNumber)}
          </h1>
          <p className="text-muted-foreground mt-1">환자 상세 정보</p>
          <p className="text-xs text-muted-foreground">
            {patient.age}세 · {patient.sex}
          </p>
          <p className="text-xs text-muted-foreground">
            {patient.ward} · {patient.department}
          </p>
          <p className="text-xs text-muted-foreground">
            재원 {patient.lengthOfStayDays ?? 1}일
          </p>
          <p className="text-xs text-muted-foreground">
            입실 원인: {patient.admissionCause}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">현재 위험도</div>
            <div 
              className={`text-4xl font-mono ${
                patient.currentRisk >= (DEMO_MODE ? 40 : 70) ? 'text-red-500' :
                patient.currentRisk >= (DEMO_MODE ? 20 : 50) ? 'text-orange-500' :
                'text-green-500'
              }`}
            >
              {patient.currentRisk}%
            </div>
          </div>
          <RiskBadge alertStatus={patient.alertStatus} />
        </div>
      </div>

      {/* Risk Over Time Chart */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-start justify-between gap-6">
          <div>
            <h2 className="text-xl">사망 위험도 추이</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant={riskTab === 'recent' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRiskTab('recent')}
                className="h-8 px-3"
              >
                분 단위 추이
              </Button>
              <Button
                variant={riskTab === 'daily' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRiskTab('daily')}
                className="h-8 px-3"
                disabled={!isLongStay}
              >
                일 단위 추이
              </Button>
              {!isLongStay && (
                <div className="text-xs text-muted-foreground">
                  7일 이상 재원 환자부터 일 단위 위험 추이를 확인할 수 있습니다.
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              {riskTab === 'recent' && (
                <>
                  <span>최근 6시간</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 text-red-400">
                      <span className="h-0.5 w-4 bg-red-400" />
                      현재 위험도
                    </span>
                    <span className="inline-flex items-center gap-1 text-orange-400">
                      <span className="h-0.5 w-4 border-t-2 border-dashed border-orange-400" />
                      예측 위험도
                    </span>
                  </div>
                </>
              )}
              {riskTab === 'daily' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>최근 14일</span>
                  <span className="inline-flex items-center gap-1 text-orange-400">
                    <span className="h-0.5 w-4 bg-orange-400" />
                    일 단위 위험 요약 (상위 10% 평균)
                  </span>
                  <span className="inline-flex items-center gap-1 text-sky-300">
                    <span className="h-3 w-3 rounded-sm bg-sky-300" />
                    고위험 지속시간 (≥70%)
                  </span>
                </div>
              )}
              {riskTab === 'recent' && (
                <>
                  <div className="flex items-center gap-2 text-sky-300">
                    <span className="inline-block h-3 w-px bg-sky-400" />
                    <span>투약 타임스탬프</span>
                  </div>
                  {firstExceedance && (
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span>
                        {format(firstExceedance.timestamp, 'HH:mm', { locale: ko })}에 {alertThreshold}% 초과
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          {riskTab === 'recent' && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground min-w-[220px]">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">최근 투약</div>
              {recentMedications.length === 0 ? (
                <div className="mt-2 text-muted-foreground">투약 기록 없음</div>
              ) : (
                <div className="mt-2 space-y-1">
                  {recentMedications.map((med, idx) => (
                    <div key={`${med.name}-${idx}`} className="flex items-center justify-between gap-2">
                      <div className="text-foreground truncate">
                        {med.name} {med.dose} {med.route}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {format(med.timestamp, 'HH:mm')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {riskTab === 'recent' && (
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={riskChartWithMeds} margin={{ top: 6, right: -8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.22}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis 
                dataKey="index"
                type="number"
                stroke="var(--muted-foreground)"
                tick={{ fill: 'var(--muted-foreground)' }}
                tickFormatter={(value) => timeLabelByIndex.get(value) ?? ''}
                interval="preserveStartEnd"
                tickMargin={4}
                padding={{ left: 0, right: 0 }}
                domain={[0, Math.max(riskChartWithMeds.length - 1, 0)]}
              />
              <YAxis 
                stroke="var(--muted-foreground)"
                tick={{ fill: 'var(--muted-foreground)' }}
                domain={[0, 100]}
                label={{ value: '위험도 (%)', angle: -90, position: 'insideLeft', fill: 'var(--muted-foreground)' }}
                tickMargin={4}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const point = payload[0]?.payload as any;
                  const riskValue = point?.risk ?? point?.predictedRisk;
                  const meds = point?.medLabels ?? [];
                  const isForecast = point?.risk === undefined;
                  return (
                    <div className="rounded-md border border-border bg-card/90 px-3 py-2 text-xs text-card-foreground shadow-sm">
                      <div className="text-sm font-medium">
                        {timeLabelByIndex.get(label) ?? ''}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        위험도{isForecast ? ' (예측)' : ''}:{' '}
                        <span className="font-mono text-foreground">
                          {Number(riskValue).toFixed(1)}%
                        </span>
                      </div>
                      {meds.length > 0 && (
                        <div className="mt-2">
                          <div className="text-sky-400">투약</div>
                          <div className="mt-1 space-y-1 text-muted-foreground">
                            {meds.map((med: string, idx: number) => (
                              <div key={`${med}-${idx}`}>• {med}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={alertThreshold}
                stroke="#dc2626"
                strokeDasharray="5 5"
                label={{ value: '임계값', fill: '#dc2626', position: 'right' }}
              />
              <Area 
                type="monotone" 
                dataKey="risk" 
                stroke="#ef4444" 
                strokeWidth={3}
                fill="url(#riskGradient)"
              />
              <Area
                type="monotone"
                dataKey="predictedRisk"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="6 6"
                fill="url(#forecastGradient)"
                fillOpacity={1}
                dot={false}
              />
              {[...medLineIndices].map((index) => (
                <ReferenceArea
                  key={`med-band-${index}`}
                  x1={index - 0.4}
                  x2={index + 0.4}
                  fill="#22d3ee"
                  fillOpacity={0.08}
                  strokeOpacity={0}
                />
              ))}
              {[...medLineIndices].map((index) => (
                <ReferenceLine
                  key={`med-line-${index}`}
                  x={index}
                  stroke="#22d3ee"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  strokeOpacity={0.95}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}
        {riskTab === 'daily' && isLongStay && (
          <div className="space-y-3">
            <div
              className="rounded-md border border-border p-3"
              style={{
                background:
                  'linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, rgba(56, 189, 248, 0) 60%)',
              }}
            >
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={dailyTrendData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="dateLabel" stroke="var(--muted-foreground)" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <YAxis yAxisId="left" stroke="var(--muted-foreground)" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} domain={[0, 100]} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--muted-foreground)" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} domain={[0, 240]} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const point = payload[0]?.payload as any;
                      return (
                        <div className="rounded-md border border-border bg-card/90 px-3 py-2 text-xs text-card-foreground shadow-sm">
                          <div className="text-sm font-medium">{point?.dateLabel}</div>
                          <div className="mt-1 text-muted-foreground">
                            일 단위 위험 요약: <span className="font-mono text-foreground">{point?.dailySummary?.toFixed(1)}%</span>
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            고위험 지속시간: <span className="font-mono text-foreground">{point?.highRiskMinutes}분</span>
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            최고 위험도: <span className="font-mono text-foreground">{point?.maxRisk?.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="dailySummary"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (cx === undefined || cy === undefined) return null;
                      const color = payload.dailySummary >= 70 ? '#ef4444' : '#f97316';
                      return <circle cx={cx} cy={cy} r={3} fill={color} stroke={color} />;
                    }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="highRiskMinutes"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (cx === undefined || cy === undefined) return null;
                      const color = payload.highRiskMinutes >= 60 ? '#f97316' : '#38bdf8';
                      return <circle cx={cx} cy={cy} r={3} fill={color} stroke={color} />;
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs text-muted-foreground">
              일 단위 위험도는 하루 동안 관측된 위험도 분포를 요약한 지표이며, 실제 사망 확률 예측값은 아님.
            </div>
          </div>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-3 gap-6">
        {/* Vital Signs - Left Column (2/3) */}
        <div className="col-span-2 space-y-6 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-3">
          <h2 className="text-xl">활력징후 및 검사 수치</h2>
          {sortedFeatures.map((feature, idx) => {
            if (feature.readings.length === 0) {
              return (
                <div key={idx} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-lg">{feature.name}</h3>
                      <div className="text-sm text-muted-foreground mt-1">
                        데이터 없음
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            const chartData = feature.readings.slice(-72).map(reading => ({
              time: format(reading.timestamp, 'HH:mm'),
              value: reading.value,
              isImputed: reading.isImputed,
            }));

            const lastReading = feature.readings[feature.readings.length - 1];
            const isOutOfRange = lastReading.value < feature.normalRange[0] || lastReading.value > feature.normalRange[1];

            return (
              <div key={idx} className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg">{feature.name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span 
                        className={`text-2xl font-mono ${
                          isOutOfRange ? 'text-orange-400' : 'text-foreground'
                        }`}
                      >
                        {lastReading.value.toFixed(1)}
                      </span>
                      <span className="text-muted-foreground">{feature.unit}</span>
                      <span className="text-sm text-muted-foreground">
                        정상: {feature.normalRange[0]}–{feature.normalRange[1]}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">마지막 측정</div>
                    <div className="text-sm text-muted-foreground">
                      {format(lastReading.timestamp, 'HH:mm:ss')}
                    </div>
                    {lastReading.isImputed && (
                      <div className="text-xs text-orange-400 mt-1">
                        ⚠ 보정값
                      </div>
                    )}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis 
                      dataKey="time" 
                      stroke="var(--muted-foreground)"
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis 
                      stroke="var(--muted-foreground)"
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--card)', 
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        color: 'var(--card-foreground)',
                        fontSize: '12px'
                      }}
                      formatter={(value: number, name: string, props: any) => [
                        `${value.toFixed(2)} ${feature.unit}${props.payload.isImputed ? ' (보정값)' : ''}`,
                        feature.name
                      ]}
                    />
                    <ReferenceLine 
                      y={feature.normalRange[0]} 
                      stroke="var(--muted-foreground)" 
                      strokeDasharray="2 2" 
                      strokeOpacity={0.5}
                    />
                    <ReferenceLine 
                      y={feature.normalRange[1]} 
                      stroke="var(--muted-foreground)" 
                      strokeDasharray="2 2"
                      strokeOpacity={0.5}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        return (
                          <Circle
                            cx={cx}
                            cy={cy}
                            r={payload.isImputed ? 3 : 2}
                            fill={payload.isImputed ? 'none' : '#3b82f6'}
                            stroke={payload.isImputed ? '#f59e0b' : '#3b82f6'}
                            strokeWidth={payload.isImputed ? 2 : 0}
                          />
                        );
                      }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span>실측값</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full border-2 border-orange-400"></div>
                    <span>보정값</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-px bg-muted-foreground"></div>
                    <span>정상 범위</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Feature Contributions - Right Column (1/3) */}
        <div className="col-span-1">
          <div className="sticky top-6 space-y-6">
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-xl mb-4">환자별 알림 설정</h2>
              <p className="text-sm text-muted-foreground mb-4">
                이 환자에 한해 알림 임계값과 변동 기준을 조정합니다.
              </p>
              <div className="space-y-4">
                {alertRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="rounded-md border border-border bg-muted p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-medium">{rule.name}</div>
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`patient-rule-${rule.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          활성화
                        </Label>
                        <Switch
                          id={`patient-rule-${rule.id}`}
                          checked={rule.enabled}
                          onCheckedChange={(checked) =>
                            updateRule(rule.id, { enabled: checked })
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label
                          htmlFor={`patient-threshold-${rule.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          위험도 (%)
                        </Label>
                        <Input
                          id={`patient-threshold-${rule.id}`}
                          type="number"
                          value={rule.riskThreshold}
                          onChange={(e) =>
                            updateRule(rule.id, {
                              riskThreshold: Number(e.target.value),
                            })
                          }
                          className="mt-1 bg-card border-border"
                          min={0}
                          max={100}
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor={`patient-duration-${rule.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          지속 (분)
                        </Label>
                        <Input
                          id={`patient-duration-${rule.id}`}
                          type="number"
                          value={rule.sustainedDuration}
                          onChange={(e) =>
                            updateRule(rule.id, {
                              sustainedDuration: Number(e.target.value),
                            })
                          }
                          className="mt-1 bg-card border-border"
                          min={0}
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor={`patient-rate-${rule.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          변화율 (pp/30분)
                        </Label>
                        <Input
                          id={`patient-rate-${rule.id}`}
                          type="number"
                          value={rule.rateOfChangeThreshold}
                          onChange={(e) =>
                            updateRule(rule.id, {
                              rateOfChangeThreshold: Number(
                                e.target.value
                              ),
                            })
                          }
                          className="mt-1 bg-card border-border"
                          min={0}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                변경사항은 이 환자의 알림 판단에 즉시 반영됩니다.
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-xl mb-4">인자별 기여도</h2>
              <p className="text-sm text-muted-foreground mb-4">
                모델의 위험도 예측에 대한 각 인자의 영향도입니다. 인과관계가 아닌 모델 해석 결과입니다.
              </p>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={contributionData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis 
                    type="number" 
                    stroke="var(--muted-foreground)"
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    label={{ value: '기여도', position: 'bottom', fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    stroke="var(--muted-foreground)"
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    width={100}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--card)', 
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: 'var(--card-foreground)',
                      fontSize: '12px'
                    }}
                    formatter={(value: number) => [`${value > 0 ? '+' : ''}${value.toFixed(1)}`, '기여도']}
                  />
                  <Bar dataKey="contribution">
                    {contributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.contribution > 0 ? '#ef4444' : '#22c55e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Data Provenance */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-lg mb-3">데이터 출처</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-muted-foreground">데이터 소스</div>
                  <div className="text-foreground">EMR, 모니터링 시스템, 검사실 인터페이스</div>
                </div>
                <div>
                  <div className="text-muted-foreground">마지막 수집</div>
                  <div className="text-foreground">{format(patient.lastDataUpdate, 'PPpp', { locale: ko })}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">데이터 품질</div>
                  <div className={`${
                    patient.imputedDataPercentage > 30 ? 'text-orange-400' :
                    patient.imputedDataPercentage > 15 ? 'text-yellow-400' :
                    'text-green-400'
                  }`}>
                    최근 1시간 {patient.imputedDataPercentage}% 보정됨
                  </div>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="rounded-lg border border-yellow-700 bg-yellow-950/20 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-yellow-200">
                  <strong>임상 의사결정 지원 도구</strong>
                  <p className="mt-1 text-yellow-300/80">
                    이 도구는 임상 판단을 지원하기 위한 위험도 추정을 제공합니다. 
                    임상 평가나 진단 절차를 대체하지 않습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
