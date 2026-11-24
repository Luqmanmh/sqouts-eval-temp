import { useMemo, useState } from "react";
import { AlertTriangle, Bot, ClipboardPen, Ear, Link, Mic, PauseCircle, Scissors, Unlink2, Volume2 } from "lucide-react";
import type { TimelineItem } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SentText } from "@/components/sent-text";
import { cn } from "cn";

type Filter = "all" | "speech" | "issues";

const SPEECH = new Set(["bot_said", "heard", "sent"]);

const isIssue = (it: TimelineItem) =>
  (it.kind === "bot_start" && !!it.flag) ||
  ["cut", "held", "sqouts_error", "error"].includes(it.kind);

/** 83.4 -> "1:23.4" */
const clock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
};

type Who = "sqouts" | "tester" | "issue" | "quiet";

function who(it: TimelineItem): Who {
  if (isIssue(it)) return "issue";
  if (it.kind === "bot_stop") return "quiet";
  return it.kind.startsWith("bot_") ? "sqouts" : "tester";
}

const DOT: Record<Who, string> = {
  sqouts: "bg-muted-foreground",
  tester: "bg-primary",
  issue: "bg-amber-500",
  quiet: "bg-border",
};

function Row({ it, bot }: { it: TimelineItem, bot:string }) {
  switch (it.kind) {
    case "bot_start":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Volume2 className="size-4 text-muted-foreground" />
          <span className="font-medium">{bot} starts speaking</span>
          {it.flag === "nudge" && (
            <Badge className="bg-amber-100 text-amber-800">
              Nudge · tester quiet {it.silent?.toFixed(1)}s
            </Badge>
          )}
          {it.flag === "interrupt" && (
            <Badge variant="destructive">Interrupts the tester</Badge>
          )}
        </div>
      );
    case "bot_stop":
      return <p className="text-xs text-muted-foreground">{bot} stops</p>;
    case "bot_said":
      return (
        <p className="w-fit max-w-[90%] rounded-xl bg-muted px-3 py-2 text-sm leading-relaxed">
          {it.text}
        </p>
      );
    case "tester_start":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Mic className="size-4 text-primary" />
          <span className="font-medium">Tester starts speaking</span>
          {it.gap != null && (
            <span
              className={cn(
                "text-xs",
                it.gap > 5 ? "font-medium text-amber-700" : "text-muted-foreground",
              )}
            >
              {it.gap.toFixed(1)}s after {bot} stopped
            </span>
          )}
        </div>
      );
    case "heard":
      return (
        <div className="max-w-[90%]">
          <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Ear className="size-3.5" /> {bot} heard
          </p>
          <p className="w-fit rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm leading-relaxed">
            {it.text || <span className="italic text-muted-foreground">(nothing)</span>}
          </p>
        </div>
      );
    case "sent":
      return (
        <div className="max-w-[90%]">
          <p className="text-xs text-muted-foreground">What the tester sent</p>
          <SentText text={it.text ?? ""} />
        </div>
      );
    case "held":
      return (
        <p className="flex items-center gap-2 text-sm text-amber-800">
          <PauseCircle className="size-4" />
          Tester was still busy, so it held this turn to answer next
        </p>
      );
    case "cut":
      return (
        <div className="text-sm">
          <p className="flex items-center gap-2 font-medium text-amber-800">
            <Scissors className="size-4" /> Tester was cut off
          </p>
          {it.text && (
            <p className="mt-1 text-muted-foreground">Got as far as: "{it.text}"</p>
          )}
        </div>
      );
    case "state_connecting":
      return(
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Unlink2 className="size-4 text-muted-foreground" />
          <span className="font-medium">Call connecting</span>
        </div>
      )
    case "state_connected":
      return(
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link className="size-4 text-muted-foreground" />
          <span className="font-medium">Call connected</span>
        </div>
      )
    case "bot_ready":
      return(
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Bot className="size-4 text-muted-foreground" />
          <span className="font-medium">{bot} ready</span>
        </div>
      )
    case "client_ready":
      return(
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ClipboardPen className="size-4 text-muted-foreground" />
          <span className="font-medium">Merit ready</span>
        </div>
      )
    case "bot_started_thinking":
      return(
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Bot className="size-4 text-muted-foreground" />
          <span className="font-medium">{bot} Thinking</span>
        </div>
      )
    case "bot_stopped_thinking":
      return(
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Bot className="size-4 text-muted-foreground" />
          <span className="font-medium">{bot} made their mind</span>
        </div>
      )
    case "sqouts_error":
    case "error":
      return (
        <div className="w-full rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-4" />
            {it.kind === "error" ? "Run error" : `${bot} reported an error`}
          </p>
          {it.text && (
            <p className="mt-1 line-clamp-4 break-all font-mono text-xs text-muted-foreground" title={it.text}>
              {it.text}
            </p>
          )}
        </div>
      );
    default:
      return null;
  }
}

export function EventsTimeline({ items, type }: { items: TimelineItem[], type?:string }) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(
    () => ({
      nudges: items.filter((i) => i.flag === "nudge").length,
      interrupts: items.filter((i) => i.flag === "interrupt").length,
      held: items.filter((i) => i.kind === "held" || i.kind === "cut").length,
      errors: items.filter((i) => i.kind === "error" || i.kind === "sqouts_error").length,
    }),
    [items],
  );

  const shown = useMemo(
    () =>
      items.filter((it) =>
        filter === "all" ? true : filter === "speech" ? SPEECH.has(it.kind) : isIssue(it),
      ),
    [items, filter],
  );

  const summary = [
    { n: counts.nudges, label: "nudge", tone: "bg-amber-100 text-amber-800" },
    { n: counts.interrupts, label: "interruption", tone: "bg-red-100 text-red-800" },
    { n: counts.held, label: "held or cut turn", tone: "bg-amber-100 text-amber-800" },
    { n: counts.errors, label: "error", tone: "bg-red-100 text-red-800" },
  ];

  const bot_type = type == "SQOUTS" ? "Sqouts" : "Agent"

  return (
    <div className="flex flex-col gap-4 rounded-2xl border-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {summary.map((s) => (
            <span
              key={s.label}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                s.n ? s.tone : "bg-muted text-muted-foreground",
              )}
            >
              {s.n} {s.label}{s.n <= 1 ? "" : "s"}
            </span>
          ))}
        </div>
        <div className="inline-flex rounded-lg bg-muted p-0.75">
          {(["all", "speech", "issues"] as Filter[]).map((f) => (
            <Button
              key={f}
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setFilter(f)}
              className={cn(
                "h-7 px-3 capitalize",
                filter === f && "bg-background shadow-sm hover:bg-background",
              )}
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground" /> {bot_type}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" /> Tester
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500" /> Worth a look
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {filter === "issues" ? "No nudges, interruptions or errors in this call." : "Nothing to show."}
        </p>
      ) : (
        <ol className="flex flex-col">
          {shown.map((it, i) => {
            const w = who(it);
            const last = i === shown.length - 1;
            return (
              <li key={i} className="grid grid-cols-[4.5rem_1rem_1fr] gap-x-3">
                <span className="pt-1 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {clock(it.t)}
                </span>
                <div className="relative flex justify-center">
                  {!last && <span className="absolute top-3 bottom-0 w-px bg-border" />}
                  <span className={cn("relative mt-1.5 size-2.5 rounded-full ring-4 ring-background", DOT[w])} />
                </div>
                <div className="min-w-0 pb-4">
                  <Row it={it} bot={bot_type}/>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
