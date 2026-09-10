/**
 * Placeholder for the Driver Voice Monitor while it is on hold. The working
 * monitor still lives in VoiceArousalMonitor.tsx - the page just renders this
 * card instead, so there is no way into it yet.
 */
export default function VoiceMonitorPlaceholder() {
  return (
    <article className="monitor-card is-exploring">
      <div className="monitor-topline">
        <h3 className="monitor-title">Driver Voice Monitor</h3>
        <p className="monitor-status">
          <span aria-hidden="true" /> Still exploring
        </p>
      </div>

      <p className="monitor-lede">
        A read on pitch and vocal energy as a second signal alongside the eyes. We
        are still exploring this one — it is not open to try yet.
      </p>

      <p className="monitor-description">
        Would look for changes in pitch and vocal energy over a rolling window.
        Noise, conversation and microphone position all affect the reading. Audio
        would be processed on this device and never uploaded.
      </p>
    </article>
  );
}
