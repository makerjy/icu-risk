import { useState, useMemo } from 'react';
import { Patient } from '../data/mockData';
import { RiskBadge } from './RiskBadge';
import { RiskSparkline } from './RiskSparkline';
import { Button } from './ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { Badge } from './ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

interface PatientListDashboardProps {
  patients: Patient[];
  onSelectPatient: (icuId: string) => void;
}

type SortField = 'bedNumber' | 'currentRisk' | 'changeInLast30Min' | 'lastDataUpdate' | 'imputedDataPercentage';
type SortDirection = 'asc' | 'desc';

export function PatientListDashboard({ patients, onSelectPatient }: PatientListDashboardProps) {
  const formatBedLabel = (bedNumber: string) => `ICU-${bedNumber.slice(-3)}`;
  const [sortField, setSortField] = useState<SortField>('currentRisk');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterRapidIncrease, setFilterRapidIncrease] = useState(false);
  const [filterHighRisk, setFilterHighRisk] = useState(false);
  const [filterStaleData, setFilterStaleData] = useState(false);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedAndFilteredPatients = useMemo(() => {
    let filtered = [...patients];

    if (filterRapidIncrease) {
      filtered = filtered.filter(p => p.alertStatus === 'rapid-increase');
    }
    if (filterHighRisk) {
      filtered = filtered.filter(p => p.alertStatus === 'sustained-high');
    }
    if (filterStaleData) {
      filtered = filtered.filter(p => p.alertStatus === 'stale-data');
    }

    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'lastDataUpdate') {
        aVal = a.lastDataUpdate.getTime();
        bVal = b.lastDataUpdate.getTime();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [patients, sortField, sortDirection, filterRapidIncrease, filterHighRisk, filterStaleData]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-30" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl tracking-tight">ICU 위험도 대시보드</h1>
          <p className="text-muted-foreground mt-1">실시간 사망 위험도 모니터링 · 임상 의사결정 지원</p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div>전체 환자: {patients.length}명</div>
          <div>활성 알림: {patients.filter(p => p.alertStatus !== 'normal').length}건</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center p-4 bg-card rounded-lg border border-border">
        <Filter className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">필터:</span>
        <Button
          variant={filterRapidIncrease ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterRapidIncrease(!filterRapidIncrease)}
          className={filterRapidIncrease ? "bg-orange-600 hover:bg-orange-700" : ""}
        >
          급격한 증가
        </Button>
        <Button
          variant={filterHighRisk ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterHighRisk(!filterHighRisk)}
          className={filterHighRisk ? "bg-red-600 hover:bg-red-700" : ""}
        >
          지속적 고위험
        </Button>
        <Button
          variant={filterStaleData ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterStaleData(!filterStaleData)}
          className={filterStaleData ? "bg-gray-600 hover:bg-gray-700" : ""}
        >
          데이터 지연
        </Button>
        {(filterRapidIncrease || filterHighRisk || filterStaleData) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterRapidIncrease(false);
              setFilterHighRisk(false);
              setFilterStaleData(false);
            }}
          >
            전체 보기
          </Button>
        )}
      </div>

      {/* Patient Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-4 py-4 text-left">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('bedNumber')}
                    className="flex items-center hover:bg-accent"
                  >
                    병상
                    <SortIcon field="bedNumber" />
                  </Button>
                </th>
                <th className="px-4 py-4 text-left">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('currentRisk')}
                    className="flex items-center hover:bg-accent"
                  >
                    위험도 (%)
                    <SortIcon field="currentRisk" />
                  </Button>
                </th>
                <th className="px-4 py-4 text-left">
                  <span className="text-sm text-muted-foreground px-3">추이 (6시간)</span>
                </th>
                <th className="px-4 py-4 text-left">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('changeInLast30Min')}
                    className="flex items-center hover:bg-accent"
                  >
                    30분 변화
                    <SortIcon field="changeInLast30Min" />
                  </Button>
                </th>
                <th className="px-4 py-4 text-left">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('lastDataUpdate')}
                    className="flex items-center hover:bg-accent"
                  >
                    마지막 업데이트
                    <SortIcon field="lastDataUpdate" />
                  </Button>
                </th>
                <th className="px-4 py-4 text-left">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('imputedDataPercentage')}
                    className="flex items-center hover:bg-accent"
                  >
                    보정값 (%)
                    <SortIcon field="imputedDataPercentage" />
                  </Button>
                </th>
                <th className="px-4 py-4 text-left">
                  <span className="text-sm text-muted-foreground px-3">주요 기여 인자</span>
                </th>
                <th className="px-4 py-4 text-left">
                  <span className="text-sm text-muted-foreground px-3">알림 상태</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFilteredPatients.map((patient) => {
                const isStale = Date.now() - patient.lastDataUpdate.getTime() > 20 * 60 * 1000;
                
                return (
                  <tr
                    key={patient.icuId}
                    onClick={() => onSelectPatient(patient.icuId)}
                    className="border-b border-border hover:bg-accent cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-4">
                      <span className="text-lg font-mono">
                        {formatBedLabel(patient.bedNumber)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span 
                          className={`text-2xl font-mono ${
                            patient.currentRisk >= 70 ? 'text-red-500' :
                            patient.currentRisk >= 50 ? 'text-orange-500' :
                            patient.currentRisk >= 30 ? 'text-yellow-500' :
                            'text-green-500'
                          }`}
                        >
                          {patient.currentRisk}
                        </span>
                        <span className="text-muted-foreground">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <RiskSparkline data={patient.riskHistory} width={120} height={40} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        <span 
                          className={`text-lg font-mono ${
                            patient.changeInLast30Min > 5 ? 'text-orange-500' :
                            patient.changeInLast30Min < -5 ? 'text-green-500' :
                            'text-muted-foreground'
                          }`}
                        >
                          {patient.changeInLast30Min > 0 ? '+' : ''}{patient.changeInLast30Min}
                        </span>
                        <span className="text-muted-foreground text-sm">pp</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className={`text-sm ${isStale ? 'text-orange-400' : 'text-muted-foreground'}`}>
                        {formatDistanceToNow(patient.lastDataUpdate, { addSuffix: true, locale: ko })}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span 
                          className={`text-lg font-mono ${
                            patient.imputedDataPercentage > 30 ? 'text-orange-500' :
                            patient.imputedDataPercentage > 15 ? 'text-yellow-500' :
                            'text-muted-foreground'
                          }`}
                        >
                          {patient.imputedDataPercentage}
                        </span>
                        <span className="text-muted-foreground">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-1.5 flex-wrap max-w-xs">
                        {patient.topContributors.map((contributor, idx) => (
                          <Badge 
                            key={idx} 
                            variant="outline"
                            className="text-xs bg-muted border-border"
                          >
                            {contributor}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <RiskBadge alertStatus={patient.alertStatus} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {sortedAndFilteredPatients.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          선택한 필터와 일치하는 환자가 없습니다.
        </div>
      )}
    </div>
  );
}
