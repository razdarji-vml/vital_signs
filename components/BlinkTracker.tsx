"use client";

import { useState } from "react";
import DriveTest from "@/components/DriveTest";
import {
  formatClock,
  zoneLabel,
  type BlinkSample,
  type DriveSummary,
} from "@/lib/blinkAnalysis";

type Result = { summary: DriveSummary; events: BlinkSample[] };

export default function BlinkTracker() {
  const [result, setResult] = useState<Result | null>(null);
  const [open, setOpen] = useState<"brief" | "report" | null>(null);

  const summary = result?.summary;

  return (
    <article className="monitor-card">
      <div className="monitor-topline">
        <h3 className="monitor-title">Driver Eye Monitor</h3>
        <button
          onClick={() => setOpen(summary ? "report" : "brief")}
          className={`sensor-button ${summary ? "stop" : ""}`}
        >
          {summary ? "View report" : "Begin drive test"}
        </button>
      </div>

      {summary ? (
        <>
          <div className="metrics">
            <div>
              <p className="metric-label">Last drive</p>
              <p className="metric-value">
                {summary.totalBlinks} blinks · {formatClock(summary.durationS)}
              </p>
            </div>
            <div>
              <p className="metric-label">Average rate</p>
              <p className={`metric-value reading-${summary.level}`}>
                {Math.round(summary.averageRate)}/min · {zoneLabel(summary.level)}
              </p>
            </div>
          </div>

          <div className="metric-bars single">
            <button
              type="button"
              className="sensor-button card-secondary"
              onClick={() => setOpen("brief")}
            >
              Run a new drive
            </button>
          </div>
        </>
      ) : (
        <p className="monitor-lede">
          Watch a one-minute drive while your camera counts your blinks, then read
          the rate back against normal, elevated and high bands.
        </p>
      )}

      <p className="monitor-description">
        Tracks changes in blink activity that may accompany stress. Lighting, dry
        eyes, eyewear and road conditions can all affect the reading. Video is
        processed on this device and is never uploaded.
      </p>

      {open && (
        <DriveTest
          initialResult={open === "report" ? result : null}
          onComplete={setResult}
          onClose={() => setOpen(null)}
        />
      )}
    </article>
  );
}
