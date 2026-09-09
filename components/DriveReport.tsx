"use client";

import BlinkRateChart from "@/components/BlinkRateChart";
import {
  formatClock,
  zoneLabel,
  type BlinkSample,
  type DriveSummary,
  type ZoneId,
} from "@/lib/blinkAnalysis";

function LevelIcon({ level }: { level: ZoneId }) {
  if (level === "normal") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 12.8 9.2 18 20 7" fill="none" stroke="currentColor" strokeWidth="2.4" />
      </svg>
    );
  }
  if (level === "elevated") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M12 6.6v7.2" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="12" cy="17.4" r="1.3" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3 22.4 21H1.6Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M12 9.6v5.2" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="18" r="1.3" fill="currentColor" />
    </svg>
  );
}

const HEADLINE: Record<ZoneId, string> = {
  normal: "Steady eyes.",
  elevated: "Signals worth a break.",
  high: "Strong fatigue signals.",
};

type Stat = { label: string; value: string; note?: string };

export default function DriveReport({
  summary,
  events,
  onRestart,
  onClose,
}: {
  summary: DriveSummary;
  events: BlinkSample[];
  onRestart: () => void;
  onClose: () => void;
}) {
  const stats: Stat[] = [
    {
      label: "Blinks recorded",
      value: String(summary.totalBlinks),
      note: `over ${formatClock(summary.durationS)}`,
    },
    {
      label: "Peak rate",
      value: `${Math.round(summary.peak.rate)}/min`,
      note: `at ${formatClock(summary.peak.t)}`,
    },
    {
      label: "Long closures",
      value: String(summary.longClosures.length),
      note: "over 400ms",
    },
    {
      label: "Face tracked",
      value: `${Math.round(summary.coverage * 100)}%`,
      note: "of frames",
    },
  ];


  return (
    <div className="dt-report">
      <header className="dt-report-head">
        <div>
          <p className="dt-eyebrow">
            <span /> 03 / Result
          </p>
          <h2 className="dt-report-title">{HEADLINE[summary.level]}</h2>
        </div>
        <p className={`dt-level dt-level-${summary.level}`}>
          <LevelIcon level={summary.level} />
          <span>{zoneLabel(summary.level)}</span>
        </p>
      </header>

      <div className="dt-hero-row">
        <div className="dt-hero">
          <p className="dt-hero-label">Average blink rate</p>
          <p className="dt-hero-value">{Math.round(summary.averageRate)}</p>
          <p className="dt-hero-unit">blinks per minute</p>
        </div>
        <dl className="dt-stats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>
                {stat.value}
                {stat.note && <span>{stat.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <BlinkRateChart
        series={summary.series}
        events={events}
        durationS={summary.durationS}
        peak={summary.peak}
      />

      <div className="dt-readout">
        <section>
          <h3>Why this level</h3>
          <ul>
            {summary.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
        {summary.caveats.length > 0 && (
          <section>
            <h3>Read it with care</h3>
            <ul className="dt-caveats">
              {summary.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="disclaimer dt-report-disclaimer">
        <span className="disclaimer-mark" aria-hidden="true">!</span>
        <p>
          <strong>For awareness only — not a safety or diagnostic system.</strong>{" "}
          Blink rate shifts with lighting, screens, dry eyes and eyewear as much as
          with fatigue. This is a simulation of driver vital-sign monitoring.
        </p>
      </aside>

      <div className="dt-actions">
        <button type="button" className="dt-button" onClick={onRestart}>
          Run it again
        </button>
        <button type="button" className="dt-button dt-button-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
