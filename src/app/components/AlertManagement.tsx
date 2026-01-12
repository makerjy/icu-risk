import { AlertRule, AlertPerformanceMetrics, AlertLogEntry, mockAlertPerformance, mockAlertLog } from '../data/mockData';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { ArrowLeft, Save, TrendingUp, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Badge } from './ui/badge';

interface AlertManagementProps {
  onBack: () => void;
  rules: AlertRule[];
  onUpdateRules: (rules: AlertRule[]) => void;
}

export function AlertManagement({ onBack, rules, onUpdateRules }: AlertManagementProps) {
  const performance: AlertPerformanceMetrics = mockAlertPerformance;
  const alertLog: AlertLogEntry[] = mockAlertLog;

  const updateRule = (id: string, updates: Partial<AlertRule>) => {
    onUpdateRules(
      rules.map(rule =>
        rule.id === id ? { ...rule, ...updates } : rule
      )
    );
  };

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
            <h1 className="text-3xl tracking-tight">알림 관리</h1>
            <p className="text-muted-foreground mt-1">임계값 설정 및 성능 모니터링</p>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">거짓 알림</span>
          </div>
          <div className="text-3xl font-mono">
            {performance.falseAlarmsPerHundredPatientDays.toFixed(1)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">환자 100일당</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="h-4 w-4" />
            <span className="text-sm">중간 선행 시간</span>
          </div>
          <div className="text-3xl font-mono">
            {performance.medianLeadTimeHours.toFixed(1)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">이벤트 발생 전 시간</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm">민감도</span>
          </div>
          <div className="text-3xl font-mono text-green-500">
            {(performance.sensitivity * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">참 양성율</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm">특이도</span>
          </div>
          <div className="text-3xl font-mono text-green-500">
            {(performance.specificity * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">참 음성율</div>
        </div>
      </div>

      {/* Alert Rules Configuration */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl">알림 규칙 설정</h2>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Save className="h-4 w-4 mr-2" />
            변경사항 저장
          </Button>
        </div>

        <div className="space-y-6">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-border bg-muted p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg">{rule.name}</h3>
                  <Badge variant="outline" className="text-xs bg-card border-border">
                    ID: {rule.id}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`enable-${rule.id}`} className="text-sm text-muted-foreground">
                    활성화
                  </Label>
                  <Switch
                    id={`enable-${rule.id}`}
                    checked={rule.enabled}
                    onCheckedChange={(checked) => updateRule(rule.id, { enabled: checked })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor={`threshold-${rule.id}`} className="text-sm text-muted-foreground">
                    위험도 임계값 (%)
                  </Label>
                  <Input
                    id={`threshold-${rule.id}`}
                    type="number"
                    value={rule.riskThreshold}
                    onChange={(e) => updateRule(rule.id, { riskThreshold: parseInt(e.target.value) })}
                    className="mt-1.5 bg-card border-border"
                    min={0}
                    max={100}
                  />
                </div>

                <div>
                  <Label htmlFor={`duration-${rule.id}`} className="text-sm text-muted-foreground">
                    지속 시간 (분)
                  </Label>
                  <Input
                    id={`duration-${rule.id}`}
                    type="number"
                    value={rule.sustainedDuration}
                    onChange={(e) => updateRule(rule.id, { sustainedDuration: parseInt(e.target.value) })}
                    className="mt-1.5 bg-card border-border"
                    min={0}
                  />
                </div>

                <div>
                  <Label htmlFor={`rateofchange-${rule.id}`} className="text-sm text-muted-foreground">
                    변화율 (pp/30분)
                  </Label>
                  <Input
                    id={`rateofchange-${rule.id}`}
                    type="number"
                    value={rule.rateOfChangeThreshold}
                    onChange={(e) => updateRule(rule.id, { rateOfChangeThreshold: parseInt(e.target.value) })}
                    className="mt-1.5 bg-card border-border"
                    min={0}
                  />
                </div>
              </div>

              <div className="mt-3 text-sm text-muted-foreground">
                {rule.sustainedDuration > 0 && rule.rateOfChangeThreshold === 0 && (
                  <span>위험도가 {rule.riskThreshold}%를 {rule.sustainedDuration}분간 초과할 때 알림</span>
                )}
                {rule.rateOfChangeThreshold > 0 && rule.sustainedDuration === 0 && (
                  <span>30분간 위험도가 {rule.rateOfChangeThreshold}pp 증가할 때 알림 ({rule.riskThreshold}% 이상)</span>
                )}
                {rule.sustainedDuration > 0 && rule.rateOfChangeThreshold > 0 && (
                  <span>
                    위험도가 {rule.riskThreshold}%를 {rule.sustainedDuration}분간 초과 
                    또는 30분간 {rule.rateOfChangeThreshold}pp 증가할 때 알림
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alert Audit Log */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-xl mb-4">알림 기록</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-sm text-muted-foreground">시간</th>
                <th className="px-4 py-3 text-left text-sm text-muted-foreground">병상</th>
                <th className="px-4 py-3 text-left text-sm text-muted-foreground">규칙</th>
                <th className="px-4 py-3 text-left text-sm text-muted-foreground">발생 시 위험도</th>
                <th className="px-4 py-3 text-left text-sm text-muted-foreground">확인자</th>
                <th className="px-4 py-3 text-left text-sm text-muted-foreground">응답 시간</th>
                <th className="px-4 py-3 text-left text-sm text-muted-foreground">상태</th>
              </tr>
            </thead>
            <tbody>
              {alertLog.map((log) => {
                const responseTime = log.acknowledgedAt 
                  ? Math.round((log.acknowledgedAt.getTime() - log.timestamp.getTime()) / (60 * 1000))
                  : null;

                return (
                  <tr key={log.id} className="border-b border-border hover:bg-accent">
                    <td className="px-4 py-3 text-sm font-mono">
                      {format(log.timestamp, 'M월 d일 HH:mm:ss', { locale: ko })}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">
                      {log.bedNumber}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {log.ruleName}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-orange-500 font-mono">
                        {log.riskAtTrigger}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {log.acknowledgedBy || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {responseTime !== null ? (
                        <span className={`font-mono ${
                          responseTime <= 5 ? 'text-green-500' :
                          responseTime <= 15 ? 'text-yellow-500' :
                          'text-orange-500'
                        }`}>
                          {responseTime}분
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {log.acknowledged ? (
                        <Badge className="bg-green-900 text-green-200 hover:bg-green-900 border-0">
                          확인됨
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-900 text-yellow-200 hover:bg-yellow-900 border-0">
                          대기중
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Notes */}
      <div className="rounded-lg border border-border bg-muted p-4">
        <div className="text-sm text-muted-foreground">
          <strong>참고:</strong> 알림 규칙은 5분마다 평가됩니다. 임계값 변경사항은 저장 즉시 적용됩니다. 
          과거 성능 지표는 최근 30일 기준으로 계산됩니다. 병동별 또는 근무조별 설정은 시스템 관리자에게 문의하세요.
        </div>
      </div>
    </div>
  );
}
