'use client';

import { useId } from 'react';
import type { AssetTelemetrySample } from './assetTelemetry';

function formatElapsed(elapsedMs: number) {
  const seconds = elapsedMs / 1000;
  if (seconds < 1) return `${seconds.toFixed(2)}s`;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

export default function BootGraph({ samples: history }: { samples: readonly AssetTelemetrySample[] }) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradientId = `telemetry-area-${instanceId}`;
  const clipId = `telemetry-plot-${instanceId}`;
  const timed = history.length > 0 && history.every(sample => sample.elapsedMs !== null);
  const plot = { left: 50, right: 350, top: 14, bottom: 112 };
  const maxElapsed = timed ? Math.max(...history.map(sample => sample.elapsedMs ?? 0)) : 0;
  const points = history.map((sample, index) => {
    const x = timed
      ? plot.left + ((sample.elapsedMs ?? 0) / Math.max(maxElapsed, 1)) * (plot.right - plot.left)
      : plot.left + (history.length > 1 ? index / (history.length - 1) : 0) * (plot.right - plot.left);
    const percent = sample.loaded / sample.total * 100;
    return { x, y: plot.bottom - percent / 100 * (plot.bottom - plot.top), sample, percent };
  });
  const line = points.map((point, index) => index === 0
    ? `M${point.x} ${point.y}`
    : `H${point.x}V${point.y}`).join('');
  const area = points.length > 0
    ? `M${points[0].x} ${plot.bottom}V${points[0].y}${points.slice(1).map(point => `H${point.x}V${point.y}`).join('')}V${plot.bottom}Z`
    : '';
  const first = history[0];
  const latest = history[history.length - 1];
  const endpoint = points[points.length - 1];
  const horizontalLevels = Array.from({ length: 5 }, (_, index) => ({
    y: plot.top + (plot.bottom - plot.top) * index / 4,
    percent: 100 - index * 25,
  }));
  const verticalDivisions = [0.25, 0.5, 0.75].map(fraction => plot.left + (plot.right - plot.left) * fraction);

  return <figure className="boot-graph" aria-label="Asset completion over elapsed loading time when observed, or event order when the loading start was not observed. The progress bar provides the current status.">
    <figcaption>ASSET TELEMETRY · LIVE</figcaption>
    <svg viewBox="0 0 360 153" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1={plot.top} x2="0" y2={plot.bottom} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#71cbd0" stopOpacity=".2" />
          <stop offset="78%" stopColor="#71cbd0" stopOpacity=".045" />
          <stop offset="100%" stopColor="#71cbd0" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} />
        </clipPath>
      </defs>
      {points.length > 0 && <path d={area} fill={`url(#${gradientId})`} clipPath={`url(#${clipId})`} />}
      <g className="telemetry-grid">
        {horizontalLevels.map(({ y, percent }) => <g key={percent}>
          <path className={percent === 0 ? 'telemetry-baseline' : undefined} d={`M${plot.left} ${y}H${plot.right}`} />
          <text x="43" y={y + 3} textAnchor="end">{percent}%</text>
        </g>)}
        {verticalDivisions.map(x => <path key={x} d={`M${x} ${plot.top}V${plot.bottom}`} />)}
      </g>
      {points.length > 0 && <g clipPath={`url(#${clipId})`}>
        <path className="telemetry-glow" d={line} />
        <path className="telemetry-line" d={line} />
      </g>}
      {endpoint && latest && <>
        <circle className="telemetry-endpoint-ring" cx={endpoint.x} cy={endpoint.y} r="4" />
        <circle className="telemetry-endpoint-core" cx={endpoint.x} cy={endpoint.y} r="2" >
          <title>{latest.loaded} of {latest.total} assets loaded ({Math.round(endpoint.percent)}%)</title>
        </circle>
      </>}
      {history.length === 0 && <text className="telemetry-empty" x={(plot.left + plot.right) / 2} y="67" textAnchor="middle">AWAITING ASSET EVENTS</text>}
      {history.length > 0 && <>
        <text className="telemetry-time" x={plot.left} y="127" textAnchor="start">
          {timed ? '0s' : String(first.sequence).padStart(2, '0')}
        </text>
        {(timed ? maxElapsed > 0 : history.length > 1) && <text className="telemetry-time" x={plot.right} y="127" textAnchor="end">
          {timed ? formatElapsed(maxElapsed) : String(latest.sequence).padStart(2, '0')}
        </text>}
      </>}
      <text className="telemetry-axis-title" x="10" y="63" textAnchor="middle" transform="rotate(-90 10 63)">COMPLETION</text>
      <text className="telemetry-axis-title" x={(plot.left + plot.right) / 2} y="149" textAnchor="middle">{timed ? 'ELAPSED TIME' : 'EVENT ORDER'}</text>
    </svg>
  </figure>;
}
