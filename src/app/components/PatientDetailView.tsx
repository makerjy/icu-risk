import { Patient } from '../data/mockData';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, BarChart, Bar, Cell } from 'recharts';
import { Button } from './ui/button';
import { ArrowLeft, AlertTriangle, Circle } from 'lucide-react';
import { RiskBadge } from './RiskBadge';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface PatientDetailViewProps {
  patient: Patient;
  onBack: () => void;
}

export function PatientDetailView({ patient, onBack }: PatientDetailViewProps) {
  const formatBedLabel = (bedNumber: string) => `ICU-${bedNumber.slice(-3)}`;
  // Prepare risk data for chart
  const riskChartData = patient.riskHistory.map(point => ({
    time: format(point.timestamp, 'HH:mm'),
    timestamp: point.timestamp,
    risk: point.risk,
  }));

  // Find first threshold exceedance
  const thresholdExceedanceIndex = patient.riskHistory.findIndex(point => point.risk > 70);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="hover:bg-accent">
            <ArrowLeft className="h-4 w-4 mr-2" />
            대시보드로 돌아가기
          </Button>
          <div className="h-8 w-px bg-border" />
          <div>
            <h1 className="text-3xl font-mono">
              {formatBedLabel(patient.bedNumber)}
            </h1>
            <p className="text-muted-foreground mt-1">환자 상세 정보</p>
            <p className="text-xs text-muted-foreground">
              {patient.age}세 · {patient.sex}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-muted-foreground">현재 위험도</div>
            <div 
              className={`text-4xl font-mono ${
                patient.currentRisk >= 70 ? 'text-red-500' :
                patient.currentRisk >= 50 ? 'text-orange-500' :
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
        <div className="mb-4">
          <h2 className="text-xl">사망 위험도 추이</h2>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>최근 6시간</span>
            {firstExceedance && (
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  {format(firstExceedance.timestamp, 'HH:mm', { locale: ko })}에 70% 초과
                </span>
              </div>
            )}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={riskChartData}>
            <defs>
              <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis 
              dataKey="time" 
              stroke="var(--muted-foreground)"
              tick={{ fill: 'var(--muted-foreground)' }}
              interval="preserveStartEnd"
            />
            <YAxis 
              stroke="var(--muted-foreground)"
              tick={{ fill: 'var(--muted-foreground)' }}
              domain={[0, 100]}
              label={{ value: '위험도 (%)', angle: -90, position: 'insideLeft', fill: 'var(--muted-foreground)' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'var(--card)', 
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--card-foreground)'
              }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, '위험도']}
            />
            <ReferenceLine y={70} stroke="#dc2626" strokeDasharray="5 5" label={{ value: '임계값', fill: '#dc2626', position: 'right' }} />
            <Area 
              type="monotone" 
              dataKey="risk" 
              stroke="#ef4444" 
              strokeWidth={3}
              fill="url(#riskGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-3 gap-6">
        {/* Vital Signs - Left Column (2/3) */}
        <div className="col-span-2 space-y-6">
          <h2 className="text-xl">활력징후 및 검사 수치</h2>
          {patient.features.map((feature, idx) => {
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
