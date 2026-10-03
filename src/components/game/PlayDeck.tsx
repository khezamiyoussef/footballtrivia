import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, Timer, Zap } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { oddsInTen, optionOdds, questionChoices, TIMEOUT_CHOICE, TIMER_SECONDS, useXoOdds, xoMarketUrl, type Choice, type Question } from "@/lib/game";
import { cn } from "@/lib/utils";

/** Shrinking countdown under the ticket header; turns red and pulses for the last 5 seconds. */
function TimerBar({ secondsLeft }: { secondsLeft: number }) {
  const urgent = secondsLeft <= 5;
  return (
    <div className="flex items-center gap-2 border-b-2 border-border bg-card px-4 py-2" role="timer" aria-live="off" aria-label={`${Math.ceil(secondsLeft)} seconds left`}>
      <Timer className={cn("size-4 shrink-0", urgent ? "text-destructive" : "text-foreground")} strokeWidth={2.5} />
      <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-border bg-secondary">
        <div
          className={cn("h-full rounded-full transition-[width] duration-100 ease-linear", urgent ? "animate-pulse bg-destructive" : "bg-accent")}
          style={{ width: `${(secondsLeft / TIMER_SECONDS) * 100}%` }}
        />
      </div>
      <span className={cn("w-9 text-right font-display text-lg tabular", urgent && "text-destructive")}>{Math.ceil(secondsLeft)}s</span>
    </div>
  );
}

export function PlayDeck({ questions }: { questions: Question[] }) {
  const [idx, setIdx] = useState(0);
  const [picks, setPicks] = useState<Record<string, Choice>>({});
  const [tapped, setTapped] = useState<Choice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();
  const { data: liveOdds } = useXoOdds(questions);
  const q = questions[idx]!;
  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS);
  const answered = useRef(false);

  // Timed questions count down from the moment the card appears; stops once a choice is tapped.
  useEffect(() => {
    answered.current = false;
    setSecondsLeft(TIMER_SECONDS);
    if (!q.has_timer) return;
    const started = Date.now();
    const t = setInterval(() => {
      if (answered.current) return clearInterval(t);
      const left = Math.max(0, TIMER_SECONDS - (Date.now() - started) / 1000);
      setSecondsLeft(left);
      if (left <= 0) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, [q.id, q.has_timer]);

  useEffect(() => {
    if (q.has_timer && secondsLeft <= 0 && !answered.current) void pick(TIMEOUT_CHOICE);
    // pick reads the current question; re-run only when time runs out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  async function pick(c: Choice) {
    if (tapped || submitting) return;
    answered.current = true;
    setTapped(c);
    const next = { ...picks, [q.id]: c };
    setPicks(next);
    // Linger on "time's up" long enough to read it.
    await new Promise((r) => setTimeout(r, c === TIMEOUT_CHOICE ? 1400 : 320));
    if (idx < questions.length - 1) {
      setIdx(idx + 1);
      setTapped(null);
      return;
    }
    setSubmitting(true);
    const payload = questions.map((qq) => ({ question_id: qq.id, choice: next[qq.id] }));
    const { error } = await supabase.rpc("submit_answers", { _answers: payload });
    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      setTapped(null);
      return;
    }
    sessionStorage.setItem("fas-just-locked", "1");
    await qc.invalidateQueries();
  }

  const options = questionChoices(q);
  const multi = options.length > 2;

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <div className="mb-6">
        <div className="mb-2 flex items-end justify-between">
          <span className="font-display text-2xl">Today's five</span>
          <span className="rounded-md bg-primary px-2 py-0.5 font-display text-sm tracking-wider text-primary-foreground tabular">
            {idx + 1} / {questions.length}
          </span>
        </div>
        <div className="flex gap-1.5">
          {questions.map((qq, i) => (
            <div key={qq.id} className={cn("h-3 flex-1 overflow-hidden rounded-sm border-2 border-border", qq.is_double ? "bg-gold/40" : "bg-card")} title={qq.is_double ? "2× combo" : undefined}>
              <motion.div className={cn("h-full", qq.is_double ? "bg-gold" : "bg-accent")} initial={false} animate={{ width: i < idx || picks[qq.id] ? "100%" : "0%" }} transition={{ type: "spring", stiffness: 300, damping: 30 }} />
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex-1">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={q.id}
            initial={{ opacity: 0, x: 80, rotate: 4, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, rotate: idx % 2 ? 0.6 : -0.6, scale: 1 }}
            exit={{ opacity: 0, x: -140, rotate: -8, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className={cn("ticket flex min-h-[460px] flex-col overflow-hidden", q.is_double && "combo")}
          >
            <div className="flex items-center justify-between bg-primary px-6 py-3 font-display tracking-widest text-primary-foreground">
              {q.is_double ? (
                <span className="flex items-center gap-1.5 text-gold">
                  <Zap className="size-4 fill-current" /> Double points
                </span>
              ) : (
                <span>Admit one</span>
              )}
              <span className="rounded-sm bg-gold px-2 text-sm text-foreground">
                {q.type === "yes_no" ? "Yes or no" : q.type === "multi" ? "Pick one" : "Which first?"}
              </span>
            </div>
            {q.has_timer && <TimerBar secondsLeft={secondsLeft} />}
            <div className="relative flex flex-1 flex-col p-6">
              <AnimatePresence>
                {tapped === TIMEOUT_CHOICE && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 z-20 flex items-center justify-center bg-card/70 backdrop-blur-[2px]"
                  >
                    <motion.p
                      initial={{ scale: 2.6, rotate: -28, opacity: 0 }}
                      animate={{ scale: 1, rotate: -8, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 420, damping: 15 }}
                      className="rounded-md border-4 border-destructive bg-card px-5 py-2 font-display text-5xl tracking-wider text-destructive"
                    >
                      Time's up!
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>
              {q.is_double && (
                <motion.div
                  initial={{ scale: 2.6, rotate: -30, opacity: 0 }}
                  animate={{ scale: 1, rotate: 12, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 14, delay: 0.2 }}
                  className="absolute right-4 top-3 flex size-16 flex-col items-center justify-center rounded-full border-[3px] border-border bg-destructive font-display leading-none text-gold shadow-[3px_3px_0_var(--border)]"
                  aria-label="2x combo: double points"
                >
                  <span className="text-2xl">2×</span>
                  <span className="text-[0.6rem] tracking-widest">COMBO</span>
                </motion.div>
              )}
              <p className={cn("font-display text-sm tracking-[0.25em]", q.is_double ? "text-foreground/70" : "text-muted-foreground")}>
                Question {String(idx + 1).padStart(2, "0")}
                {q.is_double && <span className="ml-2 rounded-sm bg-primary px-1.5 text-gold">20 pts</span>}
              </p>
              <h2 className={cn("display-xl mt-2 leading-[1]", q.text.length > 48 ? "text-[2rem]" : "text-[2.4rem]", q.is_double && "pr-16")}>{q.text}</h2>
              <div className="perforation mt-auto" />
              <div className={cn("grid gap-x-3 gap-y-4 pt-6", q.type === "which_first" ? "grid-cols-1" : "grid-cols-2")}>
                {options.map((o, i) => {
                  const odds = optionOdds(o, liveOdds);
                  return (
                    // An odd last option spans the full row so the grid stays tidy.
                    <div key={o.key} className={cn("flex flex-col gap-2", multi && options.length % 2 === 1 && i === options.length - 1 && "col-span-2")}>
                      <Button
                        variant={tapped === o.key ? "pickActive" : "pick"}
                        size="pick"
                        disabled={submitting}
                        onClick={() => pick(o.key)}
                        className={cn("relative", multi && "min-h-16 px-3 py-3 text-lg leading-tight")}
                      >
                        {o.label}
                        {tapped === o.key && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="absolute -right-2 -top-2 rounded-full border-2 border-border bg-card p-1 text-foreground">
                            <Check className="size-3.5" strokeWidth={4} />
                          </motion.span>
                        )}
                      </Button>
                      {odds !== null && o.xo_slug && (
                        <a
                          href={xoMarketUrl(o.xo_slug)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${oddsInTen(odds)} in 10 people on XO back ${o.label}. Open on XO Market`}
                          className="mx-auto inline-flex items-center gap-1 rounded-full border-2 border-border bg-gold px-2.5 py-0.5 text-center text-[0.7rem] font-semibold leading-tight text-foreground shadow-[2px_2px_0_var(--border)] transition-transform hover:-translate-y-0.5"
                        >
                          <span>
                            <span className="font-display text-sm">{oddsInTen(odds)}</span> in 10 people back this
                          </span>
                          <ArrowUpRight className="size-3 shrink-0" strokeWidth={3} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      {submitting && <p className="mt-6 text-center font-display tracking-widest text-muted-foreground">Locking you in…</p>}
    </div>
  );
}
