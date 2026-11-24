import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const fmt = (s: number) =>
  Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00";

export function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate]);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play();
    else a.pause();
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border-2 bg-background p-3">
      <audio
        ref={ref}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />

      <Button type="button" size="icon" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause /> : <Play />}
      </Button>

      <span className="w-12 text-right font-mono text-sm tabular-nums">{fmt(time)}</span>

      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={time}
        onChange={(e) => {
          const t = Number(e.target.value);
          if (ref.current) ref.current.currentTime = t;
          setTime(t);
        }}
        className="h-2 flex-1 cursor-pointer accent-primary"
        aria-label="Seek"
      />

      <span className="w-12 font-mono text-sm tabular-nums text-muted-foreground">{fmt(duration)}</span>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-14 font-mono"
        onClick={() => setRate((r) => (r >= 2 ? 1 : r + 0.5))}
      >
        {rate}×
      </Button>
    </div>
  );
}