import { useEffect, useState } from "react";
import { Flame, Zap } from "lucide-react";
import { animate } from "motion";
import { msToNextDrop } from "@/lib/game";
import { cn } from "@/lib/utils";

export function StreakFlame({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border-2 border-border bg-card px-3 py-1 font-display tabular",
        n > 0 ? "text-flame" : "text-muted-foreground",
        className,
      )}
      aria-label={`${n} day streak`}
    >
      <Flame className="size-4" fill={n > 0 ? "currentColor" : "none"} />
      {n}
    </span>
  );
}

export function CountUp({ value, className }: { value: number; className?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = animate(0, value, { duration: 0.9, ease: "easeOut", onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [value]);
  return <span className={cn("tabular", className)}>{v}</span>;
}

export function Countdown() {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    setMs(msToNextDrop());
    const t = setInterval(() => setMs(msToNextDrop()), 1000);
    return () => clearInterval(t);
  }, []);
  if (ms === null) return <span className="tabular">--:--:--</span>;
  const s = Math.floor(ms / 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return (
    <span className="tabular">
      {pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}
    </span>
  );
}

/** Small red-and-gold "2x combo" tag for question headers. */
export function ComboBadge({ className }: { className?: string }) {
  return (
    <span className={cn("ml-2 inline-flex items-center gap-0.5 rounded-sm border border-border bg-destructive px-1.5 align-middle font-display text-[0.7rem] tracking-wider text-gold", className)}>
      <Zap className="size-2.5 fill-current" /> 2× combo
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-label="PL"
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-lg border-2 border-border bg-primary font-display text-2xl leading-none text-primary-foreground shadow-[3px_3px_0_var(--border)]",
        className,
      )}
    >
      PL
    </span>
  );
}
