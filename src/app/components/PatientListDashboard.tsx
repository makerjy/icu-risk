import { useEffect, useMemo, useState } from 'react';
import { Patient } from '../data/mockData';
import { RiskBadge } from './RiskBadge';
import { RiskSparkline } from './RiskSparkline';
import { Button } from './ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown, Filter, Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

interface PatientListDashboardProps {
  patients: Patient[];
  onSelectPatient: (icuId: string) => void;
}

type SortField = 'bedNumber' | 'currentRisk' | 'changeInLast30Min' | 'lastDataUpdate';
type SortDirection = 'asc' | 'desc';

export function PatientListDashboard({ patients, onSelectPatient }: PatientListDashboardProps) {
  const extractWardCode = (ward: string) => {
    const match = ward.match(/\(([^)]+)\)/);
    return match ? match[1] : ward;
  };
  const formatBedLabel = (bedNumber: string, ward: string) =>
    `${extractWardCode(ward)}-${bedNumber.slice(-3)}`;
  const vitalConfigs = [
    { key: 'sbp', label: 'SBP' },
    { key: 'dbp', label: 'DBP' },
    { key: 'hr', label: 'PR' },
    { key: 'rr', label: 'RR' },
    { key: 'temp', label: 'BT' },
    { key: 'spo2', label: 'SpO2' },
  ];
  const [sortField, setSortField] = useState<SortField>('currentRisk');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterRapidIncrease, setFilterRapidIncrease] = useState(false);
  const [filterHighRisk, setFilterHighRisk] = useState(false);
  const [filterStaleData, setFilterStaleData] = useState(false);
  const [selectedWard, setSelectedWard] = useState('전체');
  const [favoriteOrder, setFavoriteOrder] = useState<string[]>([]);
  const favoritesSet = useMemo(() => new Set(favoriteOrder), [favoriteOrder]);
  const wardOptions = useMemo(() => {
    const wards = Array.from(new Set(patients.map((patient) => patient.ward)));
    wards.sort();
    return ['전체', ...wards];
  }, [patients]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  useEffect(() => {
    let isActive = true;

    const fetchFavorites = async () => {
      try {
        const response = await fetch('/api/favorites', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as string[];
        if (isActive && Array.isArray(data)) {
          setFavoriteOrder(data);
        }
      } catch {
        // Ignore favorites load failures.
      }
    };

    fetchFavorites();

    return () => {
      isActive = false;
    };
  }, []);

  const syncFavorite = async (icuId: string, favorite: boolean, rollback: string[]) => {
    try {
      await fetch(`/api/favorites/${icuId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ favorite }),
      });
    } catch {
      setFavoriteOrder(rollback);
    }
  };

  const toggleFavorite = (icuId: string) => {
    setFavoriteOrder((prev) => {
      const isFavorite = prev.includes(icuId);
      const next = isFavorite ? prev.filter((id) => id !== icuId) : [icuId, ...prev];
      void syncFavorite(icuId, !isFavorite, prev);
      return next;
    });
  };

  const sortPatients = (items: Patient[]) => {
    const sorted = [...items];
    sorted.sort((a, b) => {
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
    return sorted;
  };

  const sortedAndFilteredPatients = useMemo(() => {
    let filtered = [...patients];

    if (selectedWard !== '전체') {
      filtered = filtered.filter((patient) => patient.ward === selectedWard);
    }
    if (filterRapidIncrease) {
      filtered = filtered.filter(p => p.alertStatus === 'rapid-increase');
    }
    if (filterHighRisk) {
      filtered = filtered.filter(p => p.alertStatus === 'sustained-high');
    }
    if (filterStaleData) {
      filtered = filtered.filter(p => p.alertStatus === 'stale-data');
    }

    const favoritePatients: Patient[] = [];
    const nonFavoritePatients: Patient[] = [];

    filtered.forEach((patient) => {
      if (favoritesSet.has(patient.icuId)) {
        favoritePatients.push(patient);
      } else {
        nonFavoritePatients.push(patient);
      }
    });

    favoritePatients.sort((a, b) => {
      const aIndex = favoriteOrder.indexOf(a.icuId);
      const bIndex = favoriteOrder.indexOf(b.icuId);
      return aIndex - bIndex;
    });

    return [...favoritePatients, ...sortPatients(nonFavoritePatients)];
  }, [
    patients,
    sortField,
    sortDirection,
    filterRapidIncrease,
    filterHighRisk,
    filterStaleData,
    selectedWard,
    favoritesSet,
    favoriteOrder,
  ]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-30" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const formatVitalValue = (value: number, unit: string) => {
    if (unit === 'C') {
      return value.toFixed(1);
    }
    return Math.round(value).toString();
  };

  const alertFeedItems = useMemo(() => {
    const items: {
      id: string;
      timestamp: Date;
      title: string;
      detail: string;
      severity: 'high' | 'medium' | 'low';
    }[] = [];

    const statusToLabel = (status: Patient['alertStatus']) => {
      if (status === 'rapid-increase') return '급격한 증가';
      if (status === 'sustained-high') return '지속적 고위험';
      if (status === 'stale-data') return '데이터 지연';
      return '정상';
    };

    patients.forEach((patient) => {
      if (patient.alertStatus !== 'normal') {
        items.push({
          id: `${patient.icuId}-risk`,
          timestamp: patient.lastDataUpdate,
          title: statusToLabel(patient.alertStatus),
          detail: `${formatBedLabel(patient.bedNumber, patient.ward)} · ${patient.currentRisk}%`,
          severity:
            patient.alertStatus === 'sustained-high'
              ? 'high'
              : patient.alertStatus === 'rapid-increase'
              ? 'medium'
              : 'low',
        });
      }
      patient.outOfRangeAlerts.forEach((alert) => {
        const directionLabel = alert.direction === 'high' ? '상승' : '하강';
        items.push({
          id: `${patient.icuId}-${alert.key}`,
          timestamp: alert.timestamp,
          title: `정상범위 이탈 · ${alert.name}`,
          detail: `${formatBedLabel(patient.bedNumber, patient.ward)} · ${alert.value.toFixed(1)} ${alert.unit} (${directionLabel})`,
          severity: 'medium',
        });
      });
    });

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return items.slice(0, 8);
  }, [patients]);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl tracking-tight">
              {selectedWard === '전체'
                ? '위험도 대시보드'
                : `${extractWardCode(selectedWard)} 위험도 대시보드`}
            </h1>
            <p className="text-muted-foreground mt-1">실시간 사망 위험도 모니터링 · 임상 의사결정 지원</p>
          </div>
          <div className="text-right text-sm text-muted-foreground space-y-2">
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs">병동</span>
              <select
                value={selectedWard}
                onChange={(event) => setSelectedWard(event.target.value)}
                className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
              >
                {wardOptions.map((ward) => (
                  <option key={ward} value={ward}>
                    {ward === '전체' ? '전체' : extractWardCode(ward)}
                  </option>
                ))}
              </select>
            </div>
            <div>전체 환자: {sortedAndFilteredPatients.length}명</div>
            <div>활성 알림: {sortedAndFilteredPatients.filter(p => p.alertStatus !== 'normal').length}건</div>
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
            <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-2 py-3 text-left">
                  <span className="text-xs text-muted-foreground px-2">알림</span>
                </th>
                <th className="px-2 py-3 text-left">
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
                <th className="px-2 py-3 text-left">
                  <span className="text-xs text-muted-foreground px-2">담당 병과</span>
                </th>
                <th className="px-2 py-3 text-left">
                  <span className="text-xs text-muted-foreground px-2">입실 원인</span>
                </th>
                <th className="px-2 py-3 text-left">
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
                <th className="px-2 py-3 text-left">
                  <span className="text-xs text-muted-foreground px-2">추이 (6시간)</span>
                </th>
                {vitalConfigs.map((vital) => (
                  <th key={vital.key} className="px-2 py-3 text-left">
                    <span className="text-xs text-muted-foreground px-2">
                      {vital.label}
                    </span>
                  </th>
                ))}
                <th className="px-2 py-3 text-left">
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
                <th className="px-2 py-3 text-left">
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
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleFavorite(patient.icuId);
                          }}
                          className="rounded-md p-1 hover:bg-muted"
                          aria-label={favoritesSet.has(patient.icuId) ? '즐겨찾기 해제' : '즐겨찾기'}
                        >
                          <Star
                            className={`h-4 w-4 ${favoritesSet.has(patient.icuId) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
                          />
                        </button>
                        <RiskBadge alertStatus={patient.alertStatus} />
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <span className="text-base font-mono">
                        {formatBedLabel(patient.bedNumber, patient.ward)}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="text-sm whitespace-nowrap leading-tight">{patient.department}</div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="text-xs text-muted-foreground whitespace-nowrap leading-tight">
                        {patient.admissionCause}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <span 
                          className={`text-xl font-mono ${
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
                    <td className="px-2 py-3">
                      <RiskSparkline data={patient.riskHistory} width={90} height={36} />
                    </td>
                    {vitalConfigs.map((vital) => {
                      const feature = patient.features.find((item) => item.key === vital.key);
                      const lastReading = feature?.readings[feature.readings.length - 1];
                      if (!feature || !lastReading) {
                        return (
                          <td key={vital.key} className="px-2 py-3 text-muted-foreground">
                            <div className="rounded-md border border-border px-2 py-1 text-center">
                              —
                            </div>
                          </td>
                        );
                      }

                      const chartData = feature.readings.slice(-72).map((reading) => ({
                        time: `${reading.timestamp.getHours()}:${String(reading.timestamp.getMinutes()).padStart(2, '0')}`,
                        value: reading.value,
                      }));

                      return (
                        <td key={vital.key} className="px-2 py-3">
                          <HoverCard openDelay={200}>
                            <HoverCardTrigger asChild>
                              <div className="rounded-md border border-border px-2 py-1 text-center font-mono cursor-help">
                                {formatVitalValue(lastReading.value, feature.unit)}
                              </div>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-72">
                              <div className="flex items-baseline justify-between">
                                <div className="text-sm font-medium">{feature.name}</div>
                                <div className="text-xs text-muted-foreground">{feature.unit}</div>
                              </div>
                              <div className="mt-2 h-24">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis
                                      dataKey="time"
                                      stroke="var(--muted-foreground)"
                                      tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                                      interval="preserveStartEnd"
                                    />
                                    <YAxis
                                      stroke="var(--muted-foreground)"
                                      tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                                      domain={['auto', 'auto']}
                                    />
                                    <Line
                                      type="monotone"
                                      dataKey="value"
                                      stroke="#3b82f6"
                                      strokeWidth={2}
                                      dot={false}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        </td>
                      );
                    })}
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1">
                        <span 
                          className={`text-base font-mono ${
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
                    <td className="px-2 py-3">
                      <div className={`text-xs ${isStale ? 'text-orange-400' : 'text-muted-foreground'}`}>
                        {formatDistanceToNow(patient.lastDataUpdate, { addSuffix: true, locale: ko })}
                      </div>
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

      {/* Alert Feed */}
      <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg">알림 리스트</h2>
            <div className="text-xs text-muted-foreground">
              최신 {alertFeedItems.length}건
            </div>
          </div>
          {alertFeedItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              활성 알림이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {alertFeedItems.map((item) => (
                <div key={item.id} className="rounded-md border border-border bg-muted/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{item.title}</div>
                    <div
                      className={`text-xs ${
                        item.severity === 'high'
                          ? 'text-red-400'
                          : item.severity === 'medium'
                          ? 'text-orange-400'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {item.severity.toUpperCase()}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {item.detail}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(item.timestamp, { addSuffix: true, locale: ko })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
