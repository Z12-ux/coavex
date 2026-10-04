"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play, SkipForward, X } from "lucide-react";
import { RingGauge } from "./charts";
import { cn } from "./ui";

/** Uppercase tracked label. Not `.t-kicker`: that class pins its colour (unlayered CSS beats utilities). */
const KICKER = "text-[11.5px] font-semibold uppercase leading-[14px] tracking-[0.16em]";

/**
 * Non-blocking rest timer pinned above the workout footer (Forge): circular
 * countdown with big condensed mm:ss, lime glow while running, "good" colour
 * when finished. Auto-starts when a set is marked done (via `startSignal`), can
 * be paused, extended or skipped. Keeps role="timer" (e2e contract).
 */
export function RestTimer({ startSignal, seconds, labels, caption }: { startSignal: number; seconds: number; labels: { rest: string; skip: string; extend: string; done: string; pause?: string; resume?: string; /** dismiss once the rest is over */ close?: string }; /** what comes next, e.g. "Next · Squat, set 2" */ caption?: ReactNode }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(seconds);
  const endRef = useRef<number>(0);
  const doneRef = useRef(false);

  // (re)start when a set is completed
  useEffect(() => {
    if (!startSignal) return;
    setTotal(seconds);
    setRemaining(seconds);
    endRef.current = Date.now() + seconds * 1000;
    doneRef.current = false;
    setRunning(true);
  }, [startSignal, seconds]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !doneRef.current) {
        doneRef.current = true;
        setRunning(false);
        try {
          navigator.vibrate?.([120, 60, 120]);
        } catch {
          /* unsupported */
        }
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  if (remaining === null) return null;
  const finished = remaining === 0;
  const frac = finished ? 1 : total ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const btn = "press grid size-11 shrink-0 place-items-center rounded-md border border-border-strong bg-surface-2 text-ink-2 hover:border-accent/50 hover:text-ink";

  return (
    <div className={cn("enter mb-2.5 flex items-center gap-3 rounded-lg border px-3 py-2.5", finished ? "border-good/40 bg-good-soft" : "border-border-strong bg-surface")} role="timer" aria-live="off" aria-label={labels.rest}>
      <RingGauge value={frac} size={76} stroke={5} tone={finished ? "good" : running ? "accent" : "muted"} glow={running || finished} label={labels.rest}>
        <span dir="ltr" className={cn("font-display text-[23px] font-extrabold leading-none tnum", finished ? "text-good" : running ? "text-ink" : "text-muted")}>
          {mm}:{ss}
        </span>
      </RingGauge>
      <div className="min-w-0 flex-1">
        <p className={cn(KICKER, "truncate", finished ? "text-good" : running ? "text-accent" : "text-muted")}>{finished ? labels.done : running ? labels.rest : `${labels.rest} · ${labels.pause ?? "pause"}`}</p>
        {caption && !finished ? <p className="mt-1 truncate text-[13px] font-medium text-ink-2">{caption}</p> : null}
        <div className="mt-2 flex items-center gap-2">
          {!finished ? (
            <>
              <button
                type="button"
                onClick={() => {
                  if (running) {
                    setRunning(false);
                  } else {
                    endRef.current = Date.now() + remaining * 1000;
                    setRunning(true);
                  }
                }}
                className={btn}
                aria-label={running ? (labels.pause ?? "pause") : (labels.resume ?? "play")}
                title={running ? labels.pause : labels.resume}
              >
                {running ? <Pause className="size-5" /> : <Play className="size-5 rtl:-scale-x-100" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  endRef.current += 30_000;
                  setTotal((t) => t + 30);
                  setRemaining((r) => (r ?? 0) + 30);
                }}
                className={cn(btn, "w-auto px-3 font-display text-[16px] font-bold tnum")}
              >
                <span dir="ltr">{labels.extend}</span>
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setRunning(false);
              setRemaining(null);
            }}
            className={btn}
            aria-label={finished ? (labels.close ?? labels.skip) : labels.skip}
            title={finished ? (labels.close ?? labels.skip) : labels.skip}
          >
            {finished ? <X className="size-5" /> : <SkipForward className="size-5 rtl:-scale-x-100" />}
          </button>
        </div>
      </div>
    </div>
  );
}
