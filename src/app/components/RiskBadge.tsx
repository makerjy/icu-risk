import { Badge } from "./ui/badge";

interface RiskBadgeProps {
  alertStatus: 'sustained-high' | 'rapid-increase' | 'stale-data' | 'normal';
}

export function RiskBadge({ alertStatus }: RiskBadgeProps) {
  const variants = {
    'sustained-high': {
      label: '지속적 고위험',
      className: 'bg-red-600 text-white hover:bg-red-600 text-sm tracking-wider border-0',
    },
    'rapid-increase': {
      label: '급격한 증가',
      className: 'bg-orange-600 text-white hover:bg-orange-600 text-sm tracking-wider border-0',
    },
    'stale-data': {
      label: '데이터 지연',
      className: 'bg-gray-600 text-white hover:bg-gray-600 text-sm tracking-wider border-0',
    },
    normal: {
      label: '안정',
      className: 'bg-green-900 text-green-200 hover:bg-green-900 text-sm tracking-wider border-0',
    },
  };

  const variant = variants[alertStatus];

  return (
    <Badge className={variant.className}>
      {variant.label}
    </Badge>
  );
}