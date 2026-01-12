import { RiskDataPoint } from "../data/mockData";

interface RiskSparklineProps {
  data: RiskDataPoint[];
  width?: number;
  height?: number;
}

export function RiskSparkline({ data, width = 100, height = 30 }: RiskSparklineProps) {
  if (data.length < 2) return null;

  const maxRisk = 100;
  const minRisk = 0;
  const range = maxRisk - minRisk;

  // Create SVG path
  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((point.risk - minRisk) / range) * height;
    return `${x},${y}`;
  });

  const pathData = `M ${points.join(' L ')}`;

  // Determine color based on trend
  const firstRisk = data[0].risk;
  const lastRisk = data[data.length - 1].risk;
  const change = lastRisk - firstRisk;

  let strokeColor = '#22c55e'; // green
  if (change > 10) {
    strokeColor = '#ea580c'; // orange
  } else if (lastRisk > 70) {
    strokeColor = '#dc2626'; // red
  } else if (change > 5) {
    strokeColor = '#f59e0b'; // amber
  }

  return (
    <svg width={width} height={height} className="inline-block">
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
