"use client";

import { useEffect, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

const BLINK_THRESHOLD = 0.4; // blendshape score above this = eye considered closed
const RATE_WINDOW_MS = 60_000;

export default function BlinkTracker() {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blinkCount, setBlinkCount] = useState(0);
  const [blinkRate, setBlinkRate] = useState(0);
  const [openness, setOpenness] = useState({ left: 1, right: 1 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const eyeClosedRef = useRef(false);
  const blinkTimestampsRef = useRef<number[]>([]);

  async function start() {
    setError(null);
    setLoading(true);
    try {
      if (!landmarkerRef.current) {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 360 },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      blinkTimestampsRef.current = [];
      setBlinkCount(0);
      setActive(true);
      loop();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start the camera."
      );
    } finally {
      setLoading(false);
    }
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
    setOpenness({ left: 1, right: 1 });
  }

  function loop() {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    // The MediaPipe video API requires a monotonic timestamp for each frame.
    // eslint-disable-next-line react-hooks/purity
    const timestamp = performance.now();
    const result: FaceLandmarkerResult = landmarker.detectForVideo(
      video,
      timestamp
    );

    const shapes = result.faceBlendshapes?.[0]?.categories;
    if (shapes) {
      const left = shapes.find((c) => c.categoryName === "eyeBlinkLeft")?.score ?? 0;
      const right = shapes.find((c) => c.categoryName === "eyeBlinkRight")?.score ?? 0;
      setOpenness({ left: 1 - left, right: 1 - right });

      const avgClosed = (left + right) / 2;
      // eslint-disable-next-line react-hooks/purity
      const now = performance.now();

      if (avgClosed > BLINK_THRESHOLD && !eyeClosedRef.current) {
        eyeClosedRef.current = true;
        blinkTimestampsRef.current.push(now);
        blinkTimestampsRef.current = blinkTimestampsRef.current.filter(
          (t) => now - t < RATE_WINDOW_MS
        );
        setBlinkCount((c) => c + 1);
        setBlinkRate(blinkTimestampsRef.current.length);
      } else if (avgClosed < BLINK_THRESHOLD * 0.6) {
        eyeClosedRef.current = false;
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    return () => {
      stop();
      landmarkerRef.current?.close();
    };
  }, []);

  const rateLabel =
    blinkRate < 15 ? "Normal" : blinkRate < 30 ? "Elevated" : "High";
  const rateColor =
    blinkRate < 15
      ? "reading-good"
      : blinkRate < 30
        ? "reading-warn"
        : "reading-alert";

  return (
    <article className="monitor-card">
      <div className="monitor-topline">
        <h3 className="monitor-title">Driver Eye Monitor</h3>
        <button
          onClick={active ? stop : start}
          disabled={loading}
          className={`sensor-button ${active ? "stop" : ""}`}
        >
          {loading ? "Loading model…" : active ? "Stop" : "Start camera"}
        </button>
      </div>

      {error && <p className="sensor-error">{error}</p>}

      <video
        ref={videoRef}
        muted
        playsInline
        className={`sensor-video scale-x-[-1] ${active ? "" : "hidden"}`}
      />

      {active && (
        <>
          <div className="metrics">
            <div>
              <p className="metric-label">Blinks (total)</p>
              <p className="metric-value">{blinkCount}</p>
            </div>
            <div>
              <p className="metric-label">Blink rate</p>
              <p className={`metric-value ${rateColor}`}>
                {blinkRate}/min · {rateLabel}
              </p>
            </div>
          </div>

          <div className="metric-bars">
            <div>
              <p className="bar-label">Left eye openness</p>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${openness.left * 100}%` }}
                />
              </div>
            </div>
            <div>
              <p className="bar-label">Right eye openness</p>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${openness.right * 100}%` }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      <p className="monitor-description">
        Tracks changes in blink activity that may accompany stress or fatigue.
        Lighting, dry eyes, eyewear and road conditions can all affect the
        reading. Video is processed on this device and is never uploaded.
      </p>
    </article>
  );
}
