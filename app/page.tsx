import BlinkTracker from "@/components/BlinkTracker";
import VoiceArousalMonitor from "@/components/VoiceArousalMonitor";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <main className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Biosignal Monitor</h1>
          <p className="text-sm text-zinc-400">
            Experimental, browser-only prototype: blink-rate tracking from
            your webcam, and a vocal-arousal heuristic from your microphone.
            Nothing is recorded or sent anywhere — all processing happens
            locally in this tab.
          </p>
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <strong>Not a medical or diagnostic tool.</strong> Blink rate and
            vocal pitch/energy variability are, at best, loose proxies for
            arousal — they&apos;re affected by lighting, mic quality, caffeine,
            screen time, allergies, and plenty else. Don&apos;t use this to
            make judgments about yourself or anyone else.
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <BlinkTracker />
          <VoiceArousalMonitor />
        </div>
      </main>
    </div>
  );
}
