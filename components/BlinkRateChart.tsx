"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatClock,
  zoneFor,
  zoneLabel,
  type BlinkSample,
  type RatePoint,
  RATE_WINDOW_S,
  LONG_CLOSURE_MS,
} from "@/lib/blinkAnalysis";

const HEIGHT = 320;
const PAD = { top: 22, right: 20, bottom: 42, left: 50 };
const TICK_STEP = 15; // matches the zone thresholds, so gridlines double as boundaries
const TABLE_STEP_S = 5;

type Props = {
  series: RatePoint[];
  events: BlinkSample[];
  durationS: number;
  peak: RatePoint;
};

export default function BlinkRateChart({
  series,
  events,
  durationS,
  peak,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const longClosures = useMemo(
    () => events.filter((event) => event.durationMs >= LONG_CLOSURE_MS),
    [events]
  );

  const yMax = Math.max(45, Math.ceil(peak.rate / TICK_STEP) * TICK_STEP);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const baseY = PAD.top + plotH;

  const x = (t: number) =>
    PAD.left + (durationS > 0 ? (t / durationS) * plotW : 0);
  const y = (rate: number) => PAD.top + plotH - (rate / yMax) * plotH;

  const linePath = series
    .map((point, i) => `${i === 0 ? "M" : "L"}${x(point.t).toFixed(1)},${y(point.rate).toFixed(1)}`)
    .join(" ");
  const areaPath =
    series.length > 0
      ? `${linePath} L${x(series[series.length - 1].t).toFixed(1)},${baseY} L${x(series[0].t).toFixed(1)},${baseY} Z`
      : "";

  const yTicks: number[] = [];
  for (let value = 0; value <= yMax; value += TICK_STEP) yTicks.push(value);

  const xTickStep = durationS > 120 ? 30 : durationS > 45 ? 10 : 5;
  const xTicks: number[] = [];
  for (let t = 0; t <= durationS + 1e-9; t += xTickStep) xTicks.push(t);

  const bands = [
    { id: "normal" as const, from: 0, to: Math.min(15, yMax) },
    { id: "elevated" as const, from: 15, to: Math.min(30, yMax) },
    { id: "high" as const, from: 30, to: yMax },
  ].filter((band) => band.to > band.from);

  const peakIndex = series.findIndex((point) => point.t === peak.t);
  const active = cursor !== null ? series[cursor] : null;

  function moveCursorTo(clientX: number) {
    const node = wrapRef.current;
    if (!node || series.length === 0 || plotW <= 0) return;
    const rect = node.getBoundingClientRect();
    const ratio = (clientX - rect.left - PAD.left) / plotW;
    const index = Math.round(ratio * (series.length - 1));
    setCursor(Math.min(series.length - 1, Math.max(0, index)));
  }

  function onKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (series.length === 0) return;
    const current = cursor ?? Math.max(0, peakIndex);
    const keys: Record<string, number> = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      Home: 0,
      End: series.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setCursor(Math.min(series.length - 1, Math.max(0, next)));
  }

  const tooltipX = active ? x(active.t) : 0;
  const flip = tooltipX > PAD.left + plotW * 0.65;

  return (
    <figure className="chart-figure">
      <figcaption className="chart-caption">
        <div>
          <p className="chart-eyebrow">Blink rate across the drive</p>
          <p className="chart-sub">
            Blinks per minute, measured in a {RATE_WINDOW_S}-second window centred on
            each point.
          </p>
        </div>
        <button
          type="button"
          className="chart-table-toggle"
          onClick={() => setShowTable((open) => !open)}
          aria-expanded={showTable}
        >
          {showTable ? "Hide data table" : "Show data table"}
        </button>
      </figcaption>

      <div className="chart-plot" ref={wrapRef}>
        {width > 0 && series.length > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="group"
            tabIndex={0}
            aria-label={`Blink rate over ${formatClock(durationS)} of driving. Average peak of ${Math.round(peak.rate)} blinks per minute at ${formatClock(peak.t)}. Use the arrow keys to read each second.`}
            onKeyDown={onKeyDown}
            onBlur={() => setCursor(null)}
            onPointerMove={(event) => moveCursorTo(event.clientX)}
            onPointerLeave={() => setCursor(null)}
          >
            {bands.map((band) => (
              <rect
                key={band.id}
                className={`chart-band chart-band-${band.id}`}
                x={PAD.left}
                y={y(band.to)}
                width={plotW}
                height={Math.max(0, y(band.from) - y(band.to))}
              />
            ))}

            {yTicks.map((tick) => (
              <g key={tick}>
                <line
                  className="chart-grid"
                  x1={PAD.left}
                  x2={PAD.left + plotW}
                  y1={y(tick)}
                  y2={y(tick)}
                />
                <text
                  className="chart-tick"
                  x={PAD.left - 10}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {tick}
                </text>
              </g>
            ))}

            {xTicks.map((tick) => (
              <text
                key={tick}
                className="chart-tick"
                x={x(tick)}
                y={baseY + 22}
                textAnchor={tick === 0 ? "start" : "middle"}
              >
                {formatClock(tick)}
              </text>
            ))}

            <path className="chart-area" d={areaPath} />
            <path className="chart-line" d={linePath} />

            {longClosures.map((event, index) => (
              <g key={`${event.t}-${index}`} transform={`translate(${x(event.t)},${baseY})`}>
                <title>
                  {`Eye closure of ${Math.round(event.durationMs)}ms at ${formatClock(event.t)}`}
                </title>
                <rect
                  className="chart-closure"
                  x={-5}
                  y={-5}
                  width={10}
                  height={10}
                  transform="rotate(45)"
                />
              </g>
            ))}

            {peak.rate > 0 && (
              <g>
                <circle className="chart-point" cx={x(peak.t)} cy={y(peak.rate)} r={5} />
                <text
                  className="chart-peak-label"
                  x={x(peak.t)}
                  y={y(peak.rate) - 14}
                  textAnchor={
                    x(peak.t) > PAD.left + plotW - 70
                      ? "end"
                      : x(peak.t) < PAD.left + 70
                        ? "start"
                        : "middle"
                  }
                >
                  {`Peak ${Math.round(peak.rate)}/min`}
                </text>
              </g>
            )}

            {active && (
              <g>
                <line
                  className="chart-crosshair"
                  x1={x(active.t)}
                  x2={x(active.t)}
                  y1={PAD.top}
                  y2={baseY}
                />
                <circle className="chart-point" cx={x(active.t)} cy={y(active.rate)} r={5} />
              </g>
            )}

            <line
              className="chart-axis"
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={baseY}
              y2={baseY}
            />
          </svg>
        )}

        {active && (
          <div
            className="chart-tooltip"
            style={{
              left: flip ? undefined : tooltipX + 14,
              right: flip ? width - tooltipX + 14 : undefined,
            }}
          >
            <p className="chart-tooltip-value">{Math.round(active.rate)}/min</p>
            <p className="chart-tooltip-meta">
              <span className={`chart-key-dot chart-dot-${zoneFor(active.rate)}`} />
              {zoneLabel(zoneFor(active.rate))} · {formatClock(active.t)}
            </p>
          </div>
        )}
      </div>

      <ul className="chart-key">
        <li>
          <span className="chart-key-line" /> Blink rate
        </li>
        <li>
          <span className="chart-key-dot chart-dot-normal" /> Normal 0–15/min
        </li>
        <li>
          <span className="chart-key-dot chart-dot-elevated" /> Elevated 15–30/min
        </li>
        <li>
          <span className="chart-key-dot chart-dot-high" /> High 30+/min
        </li>
        <li>
          <span className="chart-key-diamond" /> Closure over {LONG_CLOSURE_MS}ms
        </li>
      </ul>

      {showTable && (
        <div className="chart-table-wrap">
          <table className="chart-table">
            <caption>Blink rate every {TABLE_STEP_S} seconds</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Blinks/min</th>
                <th scope="col">Level</th>
              </tr>
            </thead>
            <tbody>
              {series
                .filter((_, index) => index % TABLE_STEP_S === 0)
                .map((point) => (
                  <tr key={point.t}>
                    <td>{formatClock(point.t)}</td>
                    <td>{Math.round(point.rate)}</td>
                    <td>{zoneLabel(zoneFor(point.rate))}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          {longClosures.length > 0 && (
            <table className="chart-table">
              <caption>Eye closures longer than {LONG_CLOSURE_MS}ms</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Duration</th>
                </tr>
              </thead>
              <tbody>
                {longClosures.map((event, index) => (
                  <tr key={`${event.t}-${index}`}>
                    <td>{formatClock(event.t)}</td>
                    <td>{Math.round(event.durationMs)}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </figure>
  );
}
