"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { BlinkSample } from "@/lib/blinkAnalysis";

const BLINK_THRESHOLD = 0.4; // blendshape score above this = eye considered closed
const BLINK_RELEASE = BLINK_THRESHOLD * 0.6; // hysteresis, so one blink counts once
const RATE_WINDOW_MS = 60_000;

export type Recording = {
  events: BlinkSample[];
  /** Share of processed frames that found a face, 0-1. */
  coverage: number;
  durationS: number;
};

type Session = {
  clock: () => number;
  startedAt: number;
  events: BlinkSample[];
  openIndex: number | null;
  frames: number;
  facesSeen: number;
};

/**
 * Runs MediaPipe face landmark detection over the camera feed and reports blink
 * activity. Attach `videoRef` to a `<video>` element, call `start()` to open the
 * camera, and wrap a stretch of it in `startRecording`/`stopRecording` to get a
 * timeline of blinks measured against a clock you supply.
 */
export function useBlinkDetection() {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceVisible, setFaceVisible] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [blinkRate, setBlinkRate] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const eyeClosedRef = useRef(false);
  const blinkTimestampsRef = useRef<number[]>([]);
  const sessionRef = useRef<Session | null>(null);

  const loop = useCallback(() => {
    // Declared inside the callback so the frame chain can schedule itself
    // without the hook depending on its own identity.
    function tick() {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // The MediaPipe video API requires a monotonic timestamp for each frame.
       
      const now = performance.now();
      const result: FaceLandmarkerResult = landmarker.detectForVideo(video, now);
      const shapes = result.faceBlendshapes?.[0]?.categories;
      const session = sessionRef.current;

      if (session) {
        session.frames += 1;
        if (shapes) session.facesSeen += 1;
      }

      if (!shapes) {
        setFaceVisible(false);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      setFaceVisible(true);
      const left = shapes.find((c) => c.categoryName === "eyeBlinkLeft")?.score ?? 0;
      const right = shapes.find((c) => c.categoryName === "eyeBlinkRight")?.score ?? 0;

      const avgClosed = (left + right) / 2;

      if (avgClosed > BLINK_THRESHOLD && !eyeClosedRef.current) {
        eyeClosedRef.current = true;
        blinkTimestampsRef.current = [
          ...blinkTimestampsRef.current.filter((t) => now - t < RATE_WINDOW_MS),
          now,
        ];
        setBlinkCount((count) => count + 1);
        setBlinkRate(blinkTimestampsRef.current.length);

        if (session) {
          session.openIndex = session.events.length;
          session.events.push({ t: session.clock(), durationMs: 0 });
        }
      } else if (avgClosed < BLINK_RELEASE && eyeClosedRef.current) {
        eyeClosedRef.current = false;
        // The closure is only measurable once the eyes reopen, so fill in the
        // duration of the blink we recorded on the way down.
        if (session?.openIndex !== null && session?.openIndex !== undefined) {
          const event = session.events[session.openIndex];
          if (event) event.durationMs = Math.max(0, (session.clock() - event.t) * 1000);
          session.openIndex = null;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    tick();
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    sessionRef.current = null;
    eyeClosedRef.current = false;
    blinkTimestampsRef.current = [];
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setActive(false);
    setFaceVisible(false);
  }, []);

  /**
   * Re-binds the live camera stream to `videoRef`. The drive test moves the
   * preview between layouts, which remounts the element and drops `srcObject`.
   */
  const attach = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch(() => {});
  }, []);

  const start = useCallback(async () => {
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

      blinkTimestampsRef.current = [];
      setBlinkCount(0);
      setBlinkRate(0);
      setActive(true);
      // The preview element may not be mounted yet - the caller re-binds with
      // `attach()` once it is. The frame loop waits for it either way.
      attach();
      loop();
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start the camera."
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, [attach, loop]);

  /** Begin logging blinks against `clock`, a function returning seconds elapsed. */
  const startRecording = useCallback((clock: () => number) => {
    sessionRef.current = {
      clock,
       
      startedAt: performance.now(),
      events: [],
      openIndex: null,
      frames: 0,
      facesSeen: 0,
    };
    setBlinkCount(0);
  }, []);

  const stopRecording = useCallback((): Recording => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return { events: [], coverage: 0, durationS: 0 };
    return {
      events: session.events,
      coverage: session.frames > 0 ? session.facesSeen / session.frames : 0,
      durationS: Math.max(0, session.clock()),
    };
  }, []);

  useEffect(() => {
    return () => {
      stop();
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [stop]);

  return {
    videoRef,
    active,
    loading,
    error,
    faceVisible,
    blinkCount,
    blinkRate,
    start,
    stop,
    attach,
    startRecording,
    stopRecording,
  };
}
