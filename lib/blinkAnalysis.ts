/**
 * Turns the raw blink events recorded during a drive test into the series and
 * summary the report renders. Pure functions only - no browser APIs - so the
 * thresholds stay in one readable place.
 */

export type BlinkSample = {
  /** Seconds into the drive at which the eyes closed. */
  t: number;
  /** How long that closure lasted, in milliseconds. */
  durationMs: number;
};

export type RatePoint = { t: number; rate: number };

export type ZoneId = "normal" | "elevated" | "high";

/** A rate at or above `from` (blinks/min) falls in the zone. Ordered low to high. */
export const ZONES: { id: ZoneId; label: string; from: number }[] = [
  { id: "normal", label: "Normal", from: 0 },
  { id: "elevated", label: "Elevated", from: 15 },
  { id: "high", label: "High", from: 30 },
];

/** A closure longer than this reads as more than an ordinary blink. */
export const LONG_CLOSURE_MS = 400;

/** Width of the centred window used to turn discrete blinks into a rate. */
export const RATE_WINDOW_S = 20;

/** Sampling step of the rate series, in seconds. */
const STEP_S = 1;

export function zoneFor(rate: number): ZoneId {
  let id: ZoneId = "normal";
  for (const zone of ZONES) if (rate >= zone.from) id = zone.id;
  return id;
}

export function zoneLabel(id: ZoneId): string {
  return ZONES.find((zone) => zone.id === id)?.label ?? "Normal";
}

function rank(id: ZoneId): number {
  return ZONES.findIndex((zone) => zone.id === id);
}

/**
 * Blink rate over time, as blinks/min measured in a window centred on each
 * sample. The window is clamped to the drive so the first and last seconds are
 * measured over real elapsed time rather than a partly empty window.
 */
export function blinkRateSeries(
  events: BlinkSample[],
  durationS: number,
  windowS = RATE_WINDOW_S
): RatePoint[] {
  if (durationS <= 0) return [];

  const width = Math.min(windowS, durationS);
  const half = width / 2;
  const times = events.map((event) => event.t).sort((a, b) => a - b);
  const points: RatePoint[] = [];

  for (let t = 0; t <= durationS + 1e-9; t += STEP_S) {
    let from = t - half;
    let to = t + half;
    if (from < 0) [from, to] = [0, width];
    if (to > durationS) [from, to] = [Math.max(0, durationS - width), durationS];

    const minutes = (to - from) / 60;
    const count = times.filter((time) => time >= from && time < to).length;
    points.push({
      t: Math.min(t, durationS),
      rate: minutes > 0 ? count / minutes : 0,
    });
  }

  // Land the last point exactly on the end of the drive so the line reaches the
  // right edge of the plot rather than stopping at the last whole second.
  const last = points[points.length - 1];
  if (last && last.t < durationS) points.push({ ...last, t: durationS });

  return points;
}

export type DriveSummary = {
  totalBlinks: number;
  durationS: number;
  /** Blinks/min across the whole drive. */
  averageRate: number;
  peak: RatePoint;
  longClosures: BlinkSample[];
  /** Share of processed frames in which a face was found, 0-1. */
  coverage: number;
  series: RatePoint[];
  /** Seconds of the drive spent in each zone. */
  timeInZone: Record<ZoneId, number>;
  level: ZoneId;
  /** Plain-language reasons behind `level`, most important first. */
  reasons: string[];
  /** Caveats that weaken the reading rather than raise it. */
  caveats: string[];
};

export function summariseDrive(input: {
  events: BlinkSample[];
  durationS: number;
  coverage: number;
}): DriveSummary {
  const { events, durationS, coverage } = input;

  const series = blinkRateSeries(events, durationS);
  const averageRate = durationS > 0 ? events.length / (durationS / 60) : 0;
  const peak = series.reduce<RatePoint>(
    (best, point) => (point.rate > best.rate ? point : best),
    { t: 0, rate: 0 }
  );
  const longClosures = events.filter(
    (event) => event.durationMs >= LONG_CLOSURE_MS
  );

  // Weight each sample by the gap to the next one, so the zone totals add up to
  // the drive length even though the final sample lands on a part-second.
  const timeInZone: Record<ZoneId, number> = { normal: 0, elevated: 0, high: 0 };
  for (let i = 0; i < series.length; i += 1) {
    const span = i < series.length - 1 ? series[i + 1].t - series[i].t : 0;
    timeInZone[zoneFor(series[i].rate)] += span;
  }

  const reasons: string[] = [];
  let level: ZoneId = "normal";
  const escalate = (to: ZoneId, why: string) => {
    if (rank(to) > rank(level)) level = to;
    reasons.push(why);
  };

  const averageZone = zoneFor(averageRate);
  if (averageZone !== "normal") {
    escalate(
      averageZone,
      `Average blink rate of ${Math.round(averageRate)}/min sits in the ${zoneLabel(averageZone).toLowerCase()} band.`
    );
  }

  if (timeInZone.high >= 8) {
    escalate(
      "high",
      `Blink rate held above 30/min for ${Math.round(timeInZone.high)}s of the drive.`
    );
  } else if (timeInZone.elevated + timeInZone.high >= 12) {
    escalate(
      "elevated",
      `Blink rate ran above 15/min for ${Math.round(timeInZone.elevated + timeInZone.high)}s of the drive.`
    );
  }

  if (longClosures.length >= 2) {
    const next = ZONES[Math.min(rank(level) + 1, ZONES.length - 1)].id;
    escalate(
      next,
      `${longClosures.length} eye closures lasted longer than ${LONG_CLOSURE_MS}ms, which can accompany drowsiness.`
    );
  }

  if (reasons.length === 0) {
    reasons.push("Blink rate stayed inside the normal 0-15/min band for the whole drive.");
  }

  const caveats: string[] = [];
  if (coverage < 0.6) {
    caveats.push(
      `A face was only found in ${Math.round(coverage * 100)}% of frames, so this reading is low confidence. Brighter, more even lighting usually fixes it.`
    );
  }
  if (durationS < 20) {
    caveats.push("The drive was too short to read a stable trend.");
  }

  return {
    totalBlinks: events.length,
    durationS,
    averageRate,
    peak,
    longClosures,
    coverage,
    series,
    timeInZone,
    level,
    reasons,
    caveats,
  };
}

/** `65.4` -> `1:05`. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
