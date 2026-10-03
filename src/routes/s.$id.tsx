import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ComboBadge, Logo, StreakFlame } from "@/components/game/bits";
import { choiceLabel, oddsInTen, questionChoices, type Question } from "@/lib/game";
import { cn } from "@/lib/utils";

type SharedPick = Pick<Question, "order_index" | "text" | "type" | "option_a_label" | "option_b_label" | "options" | "status" | "outcome" | "is_double"> & {
  choice: string;
  is_correct: boolean | null;
};
type Shared = { name: string; streak: number; play_date: string; picks: SharedPick[] };

export const Route = createFileRoute("/s/$id")({
  loader: async ({ params }) => {
    const { data, error } = await supabase.rpc("get_share", { _id: params.id });
    if (error) throw error;
    return (data as Shared | null) ?? null;
  },
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.name}'s picks · Five-a-Side` : "Five-a-Side";
    const description = "5 calls, one shot. See their picks, then make yours.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
      ],
    };
  },
  component: SharePage,
});

function prettyDate(date: string) {
  return new Date(date + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function SharePage() {
  const shared = Route.useLoaderData();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-5">
      <header className="flex items-center justify-between">
        <Link to="/" aria-label="Home"><Logo /></Link>
      </header>

      {!shared ? (
        <div className="ticket mt-8 p-6 text-center">
          <h1 className="display-xl text-3xl">This link has gone offside</h1>
          <p className="mt-2 text-muted-foreground">We couldn't find these picks. Play your own instead!</p>
          <Button asChild variant="hero" size="xl" className="mt-6 w-full"><Link to="/">Try it myself</Link></Button>
        </div>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="ticket mt-6 overflow-hidden text-center"
          >
            <div className="bg-primary px-6 py-3 font-display tracking-widest text-primary-foreground">Matchday ticket · {prettyDate(shared.play_date)}</div>
            <div className="p-6">
              <p className="font-display text-sm tracking-[0.25em] text-muted-foreground">Locked in by</p>
              <h1 className="display-xl mt-1 text-4xl">{shared.name}</h1>
              {shared.streak > 0 && <StreakFlame n={shared.streak} className="mt-3 px-4 py-1.5" />}
            </div>
          </motion.div>

          <div className="mt-5 space-y-3">
            {shared.picks.map((p, i) => {
              const picked = questionChoices(p).find((o) => o.key === p.choice);
              const settled = p.status === "resolved" || p.status === "void";
              return (
                <motion.div
                  key={p.order_index}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.07 }}
                  className={cn("ticket p-4", p.is_double && "combo")}
                >
                  <p className="font-display text-xs tracking-[0.25em] text-muted-foreground">
                    Question {String(p.order_index).padStart(2, "0")}
                    {p.is_double && <ComboBadge />}
                  </p>
                  <p className="mt-1 font-bold">{p.text}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border-2 border-border px-3 py-1 font-display tracking-wide",
                        p.is_correct === true ? "bg-accent" : p.is_correct === false ? "bg-destructive text-destructive-foreground" : "bg-gold",
                      )}
                    >
                      {p.is_correct === true && <Check className="size-4" strokeWidth={3} />}
                      {p.is_correct === false && <X className="size-4" strokeWidth={3} />}
                      {choiceLabel(p, p.choice)}
                    </span>
                    {picked?.odds != null && (
                      <span className="text-xs text-muted-foreground">
                        <span className="font-display text-sm text-foreground">{oddsInTen(picked.odds)}</span> in 10 people back this
                      </span>
                    )}
                  </div>
                  {settled && p.outcome && p.is_correct === false && (
                    <p className="mt-2 text-xs text-muted-foreground">It was {choiceLabel(p, p.outcome)}</p>
                  )}
                </motion.div>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="ticket mt-6 p-6 text-center"
          >
            <h2 className="display-xl text-3xl">Think you can call it better?</h2>
            <p className="mt-2 text-muted-foreground">5 questions, 30 seconds. Make your picks and see who's right.</p>
            <Button asChild variant="hero" size="xl" className="mt-5 w-full"><Link to="/">Try it myself</Link></Button>
          </motion.div>
        </>
      )}
    </div>
  );
}
