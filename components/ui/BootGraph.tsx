'use client';

import type { AssetTelemetrySample } from './assetTelemetry';

export default function BootGraph({ samples: history }: { samples: readonly AssetTelemetrySample[] }) {
  const timed = history.length > 0 && history.every(sample => sample.elapsedMs !== null);
  const plot = { left: 40, right: 308, top: 14, bottom: 100 };
  const maxElapsed = timed ? Math.max(...history.map(sample => sample.elapsedMs ?? 0)) : 0;
  const points = history.map((sample, index) => {
    const x = timed
      ? plot.left + ((sample.elapsedMs ?? 0) / Math.max(maxElapsed, 1)) * (plot.right - plot.left)
      : plot.left + (history.length > 1 ? index / (history.length - 1) : 0) * (plot.right - plot.left);
    const percent = Math.max(0, Math.min(100, sample.loaded / sample.total * 100));
    return { x, y: plot.bottom - percent / 100 * (plot.bottom - plot.top), sample, percent };
  });
  const line = points.map((point, index) => index === 0
    ? `M${point.x} ${point.y}`
    : `H${point.x}V${point.y}`).join('');
  const first = history[0];
  const latest = history[history.length - 1];
  const maxSeconds = maxElapsed / 1000;

  return <figure className="boot-graph" aria-label="Asset completion over elapsed loading time when observed, or event order when the loading start was not observed. The progress bar provides the current status.">
    <figcaption>ASSET TELEMETRY · LIVE</figcaption>
    <svg viewBox="0 0 320 136" fill="none" aria-hidden="true">
      {[plot.top, (plot.top + plot.bottom) / 2, plot.bottom].map((y, index) => <g key={y}>
        <path d={`M${plot.left} ${y}H${plot.right}`} stroke="#ffffff16" />
        <text x="34" y={y + 3} textAnchor="end">{100 - index * 50}</text>
      </g>)}
      {points.length > 0 && <path className="telemetry-line" d={line} stroke="#71cbd0" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
      {latest && <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill="#9ae5e4">
        <title>{latest.loaded} of {latest.total} assets loaded ({Math.round(points[points.length - 1].percent)}%)</title>
      </circle>}
      {history.length === 0 && <text x={(plot.left + plot.right) / 2} y="61" textAnchor="middle">Awaiting asset events</text>}
      {history.length > 0 && <>
        <text x={plot.left} y="111" textAnchor="start">
          {timed ? '0s' : String(first.sequence).padStart(2, '0')}
        </text>
        {(timed ? maxElapsed > 0 : history.length > 1) && <text x={plot.right} y="111" textAnchor="end">
          {timed ? `${maxSeconds.toFixed(maxSeconds < 10 ? 1 : 0)}s` : String(latest.sequence).padStart(2, '0')}
        </text>}
      </>}
      <text x="9" y="57" textAnchor="middle" transform="rotate(-90 9 57)">completed %</text>
      <text x={(plot.left + plot.right) / 2} y="131" textAnchor="middle">{timed ? 'elapsed seconds' : 'event order'}</text>
    </svg>
  </figure>;
}
