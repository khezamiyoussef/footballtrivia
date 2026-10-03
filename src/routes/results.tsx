import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, X, Minus, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Gate } from "@/components/game/Gate";
import { ComboBadge } from "@/components/game/bits";
import { choiceLabel, safeHttpsUrl, type Question } from "@/lib/game";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: "Your results — Five-a-Side" },
      { name: "description", content: "See how your Five-a-Side predictions turned out and the points you earned." },
      { property: "og:title", content: "Your results — Five-a-Side" },
      { property: "og:description", content: "Resolved predictions, your picks and points earned." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <Gate>{(uid) => <Results userId={uid} />}</Gate>,
});

type Row = { question_id: string; choice: string; is_correct: boolean | null; points_awarded: number; questions: Question };

function Results({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["results", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("answers")
        .select("question_id, choice, is_correct, points_awarded, questions!inner(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: bonuses } = await supabase.from("daily_bonuses").select("play_date, points");
      return { rows: (data ?? []) as unknown as Row[], bonuses: bonuses ?? [] };
    },
  });

  const rows = data?.rows ?? [];
  const resolved = rows.filter((r) => r.questions.status === "resolved" || r.questions.status === "void");
  const pending = rows.length - resolved.length;
  const byDate = new Map<string, Row[]>();
  for (const r of resolved) {
    const d = r.questions.play_date;
    byDate.set(d, [...(byDate.get(d) ?? []), r]);
  }

  return (
    <div>
      <h1 className="display-xl text-4xl">Results</h1>
      {pending > 0 && <p className="mt-2 text-sm text-muted-foreground">{pending} pick{pending > 1 ? "s" : ""} still waiting on the real world.</p>}
      {isLoading && <div className="mt-5 h-40 animate-pulse rounded-2xl bg-card" />}
      {!isLoading && resolved.length === 0 && (
        <div className="mt-6 ticket p-6 text-muted-foreground">Nothing resolved yet. Results land here once the outcomes are known.</div>
      )}
      <div className="mt-5 space-y-6">
        {[...byDate.entries()].map(([d, list]) => {
          const bonus = data?.bonuses.find((b) => b.play_date === d);
          return (
            <section key={d}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display font-extrabold">{new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</h2>
                {bonus && <span className="rounded-full bg-primary px-3 py-0.5 text-xs font-black text-primary-foreground">5/5 BONUS +{bonus.points}</span>}
              </div>
              <div className="space-y-2">
                {list.sort((a, b) => a.questions.order_index - b.questions.order_index).map((r) => {
                  const q = r.questions;
                  const url = safeHttpsUrl(q.xo_url);
                  const Icon = r.is_correct === null ? Minus : r.is_correct ? Check : X;
                  return (
                    <div key={r.question_id} className={cn("ticket p-4", q.is_double && "combo")}>
                      <div className="flex gap-3">
                        <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", r.is_correct === null ? "bg-secondary text-muted-foreground" : r.is_correct ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground")}>
                          <Icon className="size-4" strokeWidth={3} />
                        </span>
                        <div className="flex-1">
                          <p className="font-semibold">
                            {q.text}
                            {q.is_double && <ComboBadge />}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Outcome: <span className="text-foreground">{choiceLabel(q, q.outcome)}</span> · You: <span className="text-foreground">{choiceLabel(q, r.choice)}</span>
                          </p>
                          {url && (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                              View the real market <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                        <span className="font-display text-lg font-black tabular">+{r.points_awarded}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
