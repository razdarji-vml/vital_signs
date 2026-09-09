"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import DriveReport from "@/components/DriveReport";
import { useBlinkDetection } from "@/lib/useBlinkDetection";
import {
  formatClock,
  summariseDrive,
  type BlinkSample,
  type DriveSummary,
} from "@/lib/blinkAnalysis";

const DRIVE_SRC = "/drive.mp4";
/** How long to wait for the clip to become playable before offering a retry. */
const LOAD_TIMEOUT_MS = 40_000;
/** How long to wait for playback to actually start before giving up on it. */
const PLAY_TIMEOUT_MS = 20_000;

/** Rejects if `promise` has not settled within `ms`, so a stalled load surfaces. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("The drive clip would not start.")), ms)
    ),
  ]);
}

/** How much of the clip has downloaded, 0-1. */
function bufferedFraction(video: HTMLVideoElement): number {
  const { duration, buffered } = video;
  if (!duration || !Number.isFinite(duration) || buffered.length === 0) return 0;
  return Math.min(1, buffered.end(buffered.length - 1) / duration);
}

type Stage = "brief" | "drive" | "report";

type Result = { summary: DriveSummary; events: BlinkSample[] };

export default function DriveTest({
  onClose,
  onComplete,
  initialResult,
}: {
  onClose: () => void;
  onComplete: (result: Result) => void;
  initialResult: Result | null;
}) {
  const [stage, setStage] = useState<Stage>(initialResult ? "report" : "brief");
  const [result, setResult] = useState<Result | null>(initialResult);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  /** Latched once the camera is granted - keeps the clip off the first paint. */
  const [videoArmed, setVideoArmed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [stalled, setStalled] = useState(false);

  const driveRef = useRef<HTMLVideoElement>(null);

  const {
    videoRef,
    active,
    loading,
    error,
    faceVisible,
    blinkCount,
    start,
    stop,
    attach,
    startRecording,
    stopRecording,
  } = useBlinkDetection();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // The preview only exists during the drive, so bind the stream once it mounts.
  useEffect(() => {
    if (stage === "drive") attach();
  }, [stage, attach]);

  // Turn a clip that never becomes playable into a message with a way out.
  useEffect(() => {
    if (!videoArmed || videoReady || videoError) return;
    const timer = setTimeout(
      () =>
        setVideoError(
          "The drive clip is taking too long to load. Check your connection and try again."
        ),
      LOAD_TIMEOUT_MS
    );
    return () => clearTimeout(timer);
  }, [videoArmed, videoReady, videoError]);

  const leave = useCallback(() => {
    const video = driveRef.current;
    if (video) video.pause();
    stop();
    onClose();
  }, [onClose, stop]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") leave();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  async function enableCamera() {
    const ok = await start();
    if (!ok) return;
    // Only now does the clip start downloading, and the brief stays up while it
    // does - so the drive never begins on an empty buffer.
    setVideoArmed(true);
  }

  function retryVideo() {
    const video = driveRef.current;
    if (!video) return;
    setVideoError(null);
    setVideoReady(false);
    setBuffered(0);
    video.load();
  }

  async function beginDrive() {
    const video = driveRef.current;
    if (!video) return;

    setVideoError(null);
    if (video.currentTime > 0) video.currentTime = 0;
    setPreparing(true);

    // play() must be called synchronously inside the click for Safari to allow
    // sound, and its promise only settles once playback actually starts.
    let playing = false;
    try {
      video.muted = false;
      await withTimeout(video.play(), PLAY_TIMEOUT_MS);
      setSoundBlocked(false);
      playing = true;
    } catch {
      // Some browsers refuse unmuted playback; fall back rather than stall.
      try {
        video.muted = true;
        await withTimeout(video.play(), PLAY_TIMEOUT_MS);
        setSoundBlocked(true);
        playing = true;
      } catch (err) {
        video.pause();
        setVideoError(
          err instanceof Error ? err.message : "The drive clip could not play."
        );
      }
    }

    setPreparing(false);
    if (!playing) return;

    startRecording(() => video.currentTime);
    setStage("drive");
  }

  function finishDrive() {
    const recording = stopRecording();
    const summary = summariseDrive({
      events: recording.events,
      durationS: recording.durationS || progress.total,
      coverage: recording.coverage,
    });

    stop();
    const next = { summary, events: recording.events };
    setResult(next);
    onComplete(next);
    setStage("report");
  }

  function restart() {
    setResult(null);
    setProgress((state) => ({ ...state, current: 0 }));
    setStage("brief");
  }

  // Only ever mounted from a click, so the document is always available here.
  if (typeof document === "undefined") return null;

  const remaining = Math.max(0, progress.total - progress.current);
  const percent =
    progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  function primaryAction() {
    if (videoError) {
      return (
        <button type="button" className="dt-button dt-button-primary" onClick={retryVideo}>
          Try again
        </button>
      );
    }
    if (!active) {
      return (
        <button
          type="button"
          className="dt-button dt-button-primary"
          onClick={enableCamera}
          disabled={loading}
        >
          {loading ? "Starting camera…" : "Enable camera & continue"}
        </button>
      );
    }
    return (
      <button
        type="button"
        className="dt-button dt-button-primary"
        onClick={beginDrive}
        disabled={!videoReady || preparing}
      >
        {preparing
          ? "Starting…"
          : videoReady
            ? "Start the drive"
            : `Loading the drive… ${Math.round(buffered * 100)}%`}
      </button>
    );
  }

  return createPortal(
    <div
      className={`dt-overlay dt-stage-${stage}`}
      role="dialog"
      aria-modal="true"
      aria-label="Driver eye monitor drive test"
    >
      {/* Mounted for the whole test, but only given a src once the camera is
          granted, so opening the test never pulls the clip down. */}
      <video
        ref={driveRef}
        className="dt-drive-video"
        src={videoArmed ? DRIVE_SRC : undefined}
        preload="auto"
        playsInline
        onLoadedMetadata={(event) =>
          setProgress({ current: 0, total: event.currentTarget.duration })
        }
        onProgress={(event) => setBuffered(bufferedFraction(event.currentTarget))}
        onCanPlay={(event) => {
          setBuffered(bufferedFraction(event.currentTarget));
          setVideoReady(true);
        }}
        onTimeUpdate={(event) => {
          // Read the time synchronously - `currentTarget` is null by the time
          // React runs the updater.
          const current = event.currentTarget.currentTime;
          setProgress((state) => ({ ...state, current }));
        }}
        onWaiting={() => setStalled(true)}
        onPlaying={() => setStalled(false)}
        onEnded={finishDrive}
        onError={() =>
          setVideoError("The drive clip could not be loaded from this device.")
        }
      />

      {stage !== "drive" && (
        <header className="dt-topbar">
          <Image src="/ford-logo.svg" alt="Ford" width={120} height={48} className="dt-logo" />
          <button type="button" className="dt-close" onClick={leave}>
            Close <span aria-hidden="true">✕</span>
          </button>
        </header>
      )}

      {stage === "brief" && (
        <div className="dt-panel">
          <p className="dt-eyebrow">
            <span /> 01 / Before you begin
          </p>
          <h2 className="dt-title">
            One minute
            <br />
            behind the wheel.
          </h2>

          <ul className="dt-chips">
            <li>≈ 1 minute</li>
            <li>Camera on</li>
            <li>Sound on</li>
            <li>Nothing uploaded</li>
          </ul>

          <div className="dt-brief-grid">
            <section>
              <h3>What happens</h3>
              <ol className="dt-steps">
                <li>
                  <span aria-hidden="true">01</span>
                  <p>A short drive plays full screen, with engine and road sound.</p>
                </li>
                <li>
                  <span aria-hidden="true">02</span>
                  <p>
                    Your camera watches your eyes while you watch it. We count blinks
                    and how long each closure lasts — nothing else.
                  </p>
                </li>
                <li>
                  <span aria-hidden="true">03</span>
                  <p>
                    At the end you get your blink rate across the drive, charted
                    against normal, elevated and high bands.
                  </p>
                </li>
              </ol>
            </section>

            <section>
              <h3>To get a clean reading</h3>
              <ul className="dt-checklist">
                <li>
                  <strong>Allow the camera.</strong> Your browser will ask when you
                  continue. Frames are processed on this device and never uploaded or
                  saved.
                </li>
                <li>
                  <strong>Wear headphones.</strong> The clip carries road and cabin
                  audio that carries the drive — speakers work, headphones are better.
                </li>
                <li>
                  <strong>Face the screen in even light.</strong> A window behind you
                  silhouettes your face and the tracker loses your eyes.
                </li>
                <li>
                  <strong>Glasses are fine.</strong> Heavy glare or sunglasses are not.
                </li>
                <li>
                  <strong>Sit still and watch the road.</strong> Looking away or
                  talking changes your blink rate more than fatigue does.
                </li>
              </ul>
            </section>
          </div>

          {active && !videoError && (
            <div className="dt-ready">
              <p className={`dt-face ${videoReady ? "is-found" : ""}`}>
                <span aria-hidden="true" />
                {videoReady
                  ? "Camera on · drive ready"
                  : "Camera on · loading the drive"}
              </p>
              {!videoReady && (
                <div className="dt-load-track">
                  <div className="dt-load-fill" style={{ width: `${buffered * 100}%` }} />
                </div>
              )}
            </div>
          )}

          {(error || videoError) && (
            <p className="dt-error">{videoError ?? error}</p>
          )}

          <div className="dt-actions">
            <button type="button" className="dt-button" onClick={leave}>
              {active ? "Cancel" : "Not now"}
            </button>
            {primaryAction()}
          </div>
          <p className="dt-footnote">Press Esc at any point to stop and close.</p>
        </div>
      )}

      {stage === "drive" && (
        <div className="dt-drive">
          <div className="dt-drive-top">
            <p className="dt-rec">
              <span aria-hidden="true" /> Tracking eye activity · nothing leaves this
              device
            </p>
            <div className="dt-drive-top-right">
              {stalled && <p className="dt-buffering">Buffering…</p>}
              {soundBlocked && (
                <button
                  type="button"
                  className="dt-ghost"
                  onClick={() => {
                    const video = driveRef.current;
                    if (!video) return;
                    video.muted = false;
                    setSoundBlocked(false);
                  }}
                >
                  Enable sound
                </button>
              )}
              <button type="button" className="dt-ghost" onClick={leave}>
                Stop <span aria-hidden="true">✕</span>
              </button>
            </div>
          </div>

          <div className="dt-pip">
            <video ref={videoRef} muted playsInline className="dt-pip-video" />
            <p className="dt-pip-readout">
              <span className={`dt-pip-dot ${faceVisible ? "is-live" : ""}`} aria-hidden="true" />
              {blinkCount} blinks
            </p>
          </div>

          <div className="dt-progress">
            <div className="dt-progress-track">
              <div className="dt-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="dt-progress-meta">
              <span>{formatClock(progress.current)}</span>
              <span>−{formatClock(remaining)}</span>
            </p>
          </div>

          {videoError && (
            <div className="dt-drive-error">
              <p className="dt-error">{videoError}</p>
              <button type="button" className="dt-button" onClick={leave}>
                Close
              </button>
            </div>
          )}
        </div>
      )}

      {stage === "report" && result && (
        <DriveReport
          summary={result.summary}
          events={result.events}
          onRestart={restart}
          onClose={leave}
        />
      )}
    </div>,
    document.body
  );
}
