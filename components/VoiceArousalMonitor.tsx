"use client";

import { useEffect, useRef, useState } from "react";
import { autoCorrelate } from "@/lib/pitchDetector";

const WINDOW_MS = 8000; // rolling window used for variability stats
const STATS_INTERVAL_MS = 400;

type Sample = { t: number; pitch: number; energy: number };

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export default function VoiceArousalMonitor() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPitch, setCurrentPitch] = useState<number | null>(null);
  const [currentEnergy, setCurrentEnergy] = useState(0);
  const [pitchVariability, setPitchVariability] = useState(0);
  const [arousalScore, setArousalScore] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const historyRef = useRef<Sample[]>([]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      historyRef.current = [];
      setActive(true);
      loop();
      statsIntervalRef.current = window.setInterval(computeStats, STATS_INTERVAL_MS);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not access the microphone."
      );
    }
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (statsIntervalRef.current) window.clearInterval(statsIntervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
    rafRef.current = null;
    statsIntervalRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    setActive(false);
    setCurrentPitch(null);
    setCurrentEnergy(0);
  }

  function loop() {
    const analyser = analyserRef.current;
    const audioCtx = audioCtxRef.current;
    if (!analyser || !audioCtx) return;

    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);

    let sumSquares = 0;
    for (let i = 0; i < buf.length; i++) sumSquares += buf[i] * buf[i];
    const energy = Math.sqrt(sumSquares / buf.length);

    const pitch = autoCorrelate(buf, audioCtx.sampleRate);

    setCurrentEnergy(energy);
    setCurrentPitch(pitch > 0 ? Math.round(pitch) : null);

    // The rolling window uses a monotonic timestamp for audio samples.
    // eslint-disable-next-line react-hooks/purity
    const now = performance.now();
    historyRef.current.push({ t: now, pitch, energy });
    historyRef.current = historyRef.current.filter((s) => now - s.t < WINDOW_MS);

    rafRef.current = requestAnimationFrame(loop);
  }

  function computeStats() {
    const samples = historyRef.current;
    const voicedPitches = samples.filter((s) => s.pitch > 0).map((s) => s.pitch);
    const energies = samples.map((s) => s.energy);

    const pStd = stdDev(voicedPitches);
    const eStd = stdDev(energies);

    setPitchVariability(pStd);

    // Heuristic only: normalize each variability signal against a rough
    // "typical relaxed speech" ceiling, then blend. Not a validated
    // biomarker — see disclaimer.
    const pitchScore = Math.min(pStd / 35, 1); // ~35Hz F0 stdev ~ upper end of normal
    const energyScore = Math.min(eStd / 0.05, 1);
    const blended = 0.6 * pitchScore + 0.4 * energyScore;
    setArousalScore(Math.round(blended * 100));
  }

  useEffect(() => {
    return () => stop();
  }, []);

  const label =
    arousalScore < 30
      ? "Steady"
      : arousalScore < 60
        ? "Elevated"
        : "High variability";

  const labelColor =
    arousalScore < 30
      ? "reading-good"
      : arousalScore < 60
        ? "reading-warn"
        : "reading-alert";

  return (
    <article className="monitor-card">
      <div className="monitor-topline">
        <h3 className="monitor-title">Driver Voice Monitor</h3>
        <button
          onClick={active ? stop : start}
          className={`sensor-button ${active ? "stop" : ""}`}
        >
          {active ? "Stop" : "Start listening"}
        </button>
      </div>

      {error && <p className="sensor-error">{error}</p>}

      {active && (
        <>
          <div className="metrics">
            <div>
              <p className="metric-label">Pitch</p>
              <p className="metric-value">
                {currentPitch ? `${currentPitch} Hz` : "—"}
              </p>
            </div>
            <div>
              <p className="metric-label">Pitch variability</p>
              <p className="metric-value">{pitchVariability.toFixed(1)}</p>
            </div>
          </div>

          <div className="metric-bars single">
            <div><p className="bar-label">Mic energy</p>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${Math.min(currentEnergy * 400, 100)}%` }}
              />
            </div></div>
          </div>

          <div className="metric-bars single">
            <div><div className="monitor-topline">
              <p className="bar-label">Vocal arousal index</p>
              <span className={`metric-label ${labelColor}`}>
                {label} ({arousalScore})
              </span>
            </div>
            <div className="bar-track">
              <div
                className={`bar-fill ${arousalScore < 30 ? "reading-good" : arousalScore < 60 ? "reading-warn" : "reading-alert"}`}
                style={{ width: `${arousalScore}%`, backgroundColor: "currentColor" }}
              />
            </div></div>
          </div>
        </>
      )}

      <p className="monitor-description">
        Looks for changes in pitch and vocal energy over a rolling {WINDOW_MS / 1000}s
        window. Noise, conversation and microphone position can affect the
        reading. This is a stress-awareness cue, not a stress detector.
      </p>
    </article>
  );
}
