import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { Gate } from "@/components/game/Gate";
import { CountUp, StreakFlame } from "@/components/game/bits";
import { useLeaderboard } from "@/lib/game";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Five-a-Side" },
      { name: "description", content: "All-time and weekly standings for Five-a-Side daily football predictions." },
      { property: "og:title", content: "Leaderboard — Five-a-Side" },
      { property: "og:description", content: "Who's top of the table this week?" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <Gate>{(uid) => <Board userId={uid} />}</Gate>,
});

function Board({ userId }: { userId: string }) {
  const [period, setPeriod] = useState<"weekly" | "all">("weekly");
  const { data, isLoading } = useLeaderboard(period, true);
  return (
    <div>
      <h1 className="display-xl text-4xl">The table</h1>
      <div className="mt-4 inline-flex rounded-full border-2 border-border bg-card p-1">
        {(["weekly", "all"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn("rounded-full px-4 py-1.5 text-sm font-bold transition-colors", period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            {p === "weekly" ? "This week" : "All time"}
          </button>
        ))}
      </div>
      <div className="mt-5 space-y-2">
        {isLoading && <div className="h-40 animate-pulse rounded-2xl bg-card" />}
        {data?.length === 0 && <p className="text-muted-foreground">No players yet.</p>}
        {data?.map((r, i) => {
          const me = r.user_id === userId;
          return (
            <motion.div
              key={r.user_id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.03 }}
              className={cn("flex items-center gap-3 ticket px-4 py-3", me && "border-primary shadow-[var(--shadow-glow)]")}
            >
              <span className={cn("w-7 font-display text-xl tabular", i < 3 ? "text-destructive" : "text-muted-foreground")}>{i + 1}</span>
              <span className="flex-1 truncate font-semibold">{r.display_name}{me && <span className="ml-2 text-xs text-primary">YOU</span>}</span>
              <StreakFlame n={r.current_streak} className="px-2 py-0.5 text-sm" />
              <span className="w-14 text-right font-display text-lg font-black"><CountUp value={Number(r.points)} /></span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
