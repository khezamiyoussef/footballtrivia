import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Gate } from "@/components/game/Gate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { removePlayer } from "@/lib/admin.functions";
import { useIsAdmin, gameToday } from "@/lib/game";
import { cn } from "@/lib/utils";
import { AdminQuestions } from "@/components/game/AdminQuestions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · Five-a-Side" }] }),
  component: () => <Gate>{(uid) => <Admin userId={uid} />}</Gate>,
});

function Admin({ userId }: { userId: string }) {
  const { data: isAdmin, isLoading } = useIsAdmin(userId);
  if (isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-card" />;
  if (!isAdmin) return <p className="text-muted-foreground">Admins only.</p>;
  return <AdminTabs userId={userId} />;
}

function AdminTabs({ userId }: { userId: string }) {
  const [tab, setTab] = useState<"questions" | "players">("questions");
  return (
    <div>
      <h1 className="display-xl text-4xl">Admin</h1>
      <div className="mt-4 inline-flex rounded-full border-2 border-border bg-card p-1">
        {(["questions", "players"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("rounded-full px-4 py-1.5 font-display text-sm tracking-wider transition-colors", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            {t === "questions" ? "Questions" : "Players"}
          </button>
        ))}
      </div>
      <div className="mt-5">{tab === "questions" ? <AdminQuestions /> : <Players userId={userId} />}</div>
    </div>
  );
}

function Players({ userId }: { userId: string }) {
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const today = gameToday();
  const stats = useQuery({
    queryKey: ["admin-stats", today],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_stats", { _date: today });
      if (error) throw error;
      return data?.[0];
    },
  });
  const players = useQuery({
    queryKey: ["admin-players"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_players");
      if (error) throw error;
      return data ?? [];
    },
  });

  const needle = q.trim().toLowerCase();
  const rows = (players.data ?? []).filter(
    (p) => !needle || p.display_name.toLowerCase().includes(needle) || p.user_id.startsWith(needle),
  );

  async function reset(uid: string, name: string) {
    if (!confirm(`Reset all points, streaks and answers for ${name}?`)) return;
    const { error } = await supabase.rpc("admin_reset_player", { _uid: uid });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${name} reset`);
    qc.invalidateQueries({ queryKey: ["admin-players"] });
  }

  async function remove(uid: string, name: string) {
    if (!confirm(`Permanently delete ${name} and all their data?`)) return;
    try {
      await removePlayer({ data: { userId: uid } });
      toast.success(`${name} removed`);
      qc.invalidateQueries({ queryKey: ["admin-players"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove player");
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Players", stats.data?.total_players],
          ["Played today", stats.data?.players_today],
          ["Answers", stats.data?.total_answers],
        ].map(([label, n]) => (
          <div key={label} className="ticket p-3">
            <p className="font-display text-2xl font-black tabular">{n ?? "–"}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or ID" className="mt-4 h-11 rounded-2xl bg-card" />

      <div className="mt-3 space-y-2">
        {players.isLoading && <div className="h-40 animate-pulse rounded-2xl bg-card" />}
        {players.error && <p className="text-destructive">Couldn't load players.</p>}
        {rows.map((p) => (
          <div key={p.user_id} className="ticket p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">{p.display_name}{p.user_id === userId && <span className="ml-2 text-xs text-primary">YOU</span>}</span>
              <span className="font-display text-lg font-black tabular">{p.total_points} pts</span>
            </div>
            <button
              className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
              onClick={() => navigator.clipboard.writeText(p.user_id).then(() => toast.success("ID copied"))}
            >
              {p.user_id} <Copy className="size-3" />
            </button>
            <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <Stat label="Streak" value={p.current_streak} />
              <Stat label="Best" value={p.longest_streak} />
              <Stat label="Answers" value={p.answers_count} />
              <Stat label="Last played" value={p.last_played_date ?? "–"} />
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">Joined {new Date(p.created_at).toLocaleDateString()}</p>
            {p.user_id !== userId && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => reset(p.user_id, p.display_name)}>Reset</Button>
                <Button size="sm" variant="destructive" onClick={() => remove(p.user_id, p.display_name)}>Remove</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-secondary p-2">
      <dd className="font-display font-black tabular">{value}</dd>
      <dt className="text-muted-foreground">{label}</dt>
    </div>
  );
}
