import { useEffect, useState } from "react";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { Check, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { choiceLabel, questionChoices, useCrowd, gameToday, type Question } from "@/lib/game";
import { cn } from "@/lib/utils";
import { ComboBadge, Countdown, StreakFlame } from "./bits";
import { ShareSheet } from "./ShareSheet";

export function LockedIn({
  questions,
  answers,
  streak,
}: {
  questions: Question[];
  answers: { question_id: string; choice: string }[];
  streak: number;
}) {
  const crowd = useCrowd(gameToday(), true);

  useEffect(() => {
    if (sessionStorage.getItem("fas-just-locked")) {
      sessionStorage.removeItem("fas-just-locked");
      const colors = ["#3d195b", "#2ec4b6", "#f2c230", "#d7263d"];
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.3 }, colors });
      setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.4 }, colors }), 250);
    }
  }, []);

  const mine = Object.fromEntries(answers.map((a) => [a.question_id, a.choice]));
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const shareText = "I've locked in my 5 picks. Think you can call it better? ⚽";

  async function share() {
    setSharing(true);
    try {
      const { data: id, error } = await supabase.rpc("create_share", { _date: gameToday() });
      if (error) throw error;
      const url = `${window.location.origin}/s/${id}`;
      // Phones get their native share sheet (all installed apps); desktop share panels, notably
      // Windows', are unreliable, so computers get our own panel of social networks instead.
      // Detect real phones/tablets by device, not touch: touchscreen Windows laptops report a coarse
      // pointer but their share panel often fails. iPadOS reports itself as a Mac with touch points.
      const ua = navigator.userAgent;
      const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      if (mobile && navigator.share) {
        try {
          await navigator.share({ title: "My Five-a-Side picks", text: shareText, url });
          return;
        } catch (err) {
          // Closing the sheet is a normal "cancel"; anything else falls back to our panel.
          if ((err as { name?: string })?.name === "AbortError") return;
        }
      }
      setShareUrl(url);
    } catch (err) {
      const message = (err as { message?: unknown })?.message;
      toast.error(typeof message === "string" ? message : "Couldn't create a share link");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="ticket relative overflow-hidden text-center"
      >
        <div className="bg-primary px-6 py-3 font-display tracking-widest text-primary-foreground">Matchday ticket</div>
        <div className="p-6">
          <motion.p
            initial={{ scale: 2.4, opacity: 0, rotate: -24 }}
            animate={{ scale: 1, opacity: 1, rotate: -8 }}
            transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.25 }}
            className="mx-auto w-fit rounded-md border-4 border-destructive px-4 py-1 font-display text-4xl tracking-wider text-destructive"
          >
            Locked in
          </motion.p>
          <h1 className="display-xl mt-5 text-3xl">See you tomorrow 👀</h1>
          <div className="mt-5 flex items-center justify-center gap-3">
            <StreakFlame n={streak} className="px-4 py-2 text-lg" />
            <span className="rounded-full border-2 border-border bg-gold px-4 py-2 font-display text-lg">
              +? pts <span className="text-xs">pending</span>
            </span>
          </div>
          <div className="perforation mt-6" />
          <p className="mt-5 font-display text-sm tracking-[0.25em] text-muted-foreground">Next five drop in</p>
          <p className="font-display text-5xl text-foreground"><Countdown /></p>
          <p className="mt-1 text-xs text-muted-foreground">Fresh picks every morning at 8:00 (German time)</p>
        </div>
      </motion.div>

      <Button variant="hero" size="xl" className="w-full gap-2" disabled={sharing} onClick={share}>
        <Share2 className="size-5" /> Share my picks
      </Button>
      {shareUrl && <ShareSheet open onOpenChange={(o) => !o && setShareUrl(null)} text={shareText} url={shareUrl} />}

      <div>
        <h2 className="mb-3 font-display text-2xl">Your picks</h2>
        <div className="space-y-2">
          {questions.map((q, i) => {
            const pick = mine[q.id];
            const settled = q.status === "resolved";
            const right = settled && pick === q.outcome;
            return (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className={cn("ticket flex items-center gap-3 px-4 py-3", q.is_double && "combo")}
              >
                <span className="w-6 shrink-0 font-display text-lg text-muted-foreground tabular">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">
                    {q.text}
                    {q.is_double && <ComboBadge />}
                  </p>
                  <span
                    className={cn(
                      "mt-1.5 inline-flex items-center gap-1 rounded-md border-2 border-border px-2 py-0.5 font-display text-sm tracking-wide",
                      !settled ? "bg-gold" : right ? "bg-accent" : "bg-destructive text-destructive-foreground",
                    )}
                  >
                    {settled && (right ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />)}
                    {pick ? choiceLabel(q, pick) : "No pick"}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-display text-2xl">How the crowd picked</h2>
        <div className="space-y-3">
          {questions.map((q, i) => {
            const split = crowd.data?.[q.id] ?? {};
            const opts = questionChoices(q).map((o) => o.key);
            const total = opts.reduce((s, o) => s + (split[o] ?? 0), 0) || 1;
            return (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
                className={cn("ticket p-4", q.is_double && "combo")}
              >
                <p className="font-bold">
                  {q.text}
                  {q.is_double && <ComboBadge />}
                </p>
                <div className="mt-3 space-y-2">
                  {opts.map((o) => {
                    const pct = Math.round(((split[o] ?? 0) / total) * 100);
                    const isMine = mine[q.id] === o;
                    return (
                      <div key={o} className="relative overflow-hidden rounded-lg border-2 border-border bg-card">
                        <motion.div
                          className={isMine ? "absolute inset-y-0 left-0 bg-accent" : "absolute inset-y-0 left-0 bg-secondary"}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: 0.3 + i * 0.08 }}
                        />
                        <div className="relative flex justify-between px-3 py-2 text-sm font-bold">
                          <span>{choiceLabel(q, o)} {isMine && <span className="text-primary">· YOU</span>}</span>
                          <span className="tabular">{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button asChild variant="secondary" size="xl"><Link to="/leaderboard">Leaderboard</Link></Button>
        <Button asChild variant="secondary" size="xl"><Link to="/results">Results</Link></Button>
      </div>
    </div>
  );
}
