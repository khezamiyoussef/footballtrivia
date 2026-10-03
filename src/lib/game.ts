import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getXoOdds } from "./xo.functions";

export type Question = {
  id: string;
  play_date: string;
  order_index: number;
  type: "yes_no" | "which_first" | "multi";
  text: string;
  option_a_label: string | null;
  option_b_label: string | null;
  options: QuestionOption[] | null;
  xo_event_slug: string | null;
  /** 2x combo: a correct pick scores 20 instead of 10. */
  is_double: boolean;
  /** Player has TIMER_SECONDS to answer, or it counts as out of time. */
  has_timer: boolean;
  source_note: string | null;
  xo_url: string | null;
  status: "draft" | "live" | "resolved" | "void";
  outcome: "yes" | "no" | "a" | "b" | "void" | null;
  resolved_at: string | null;
  resolved_by: string | null;
};

/** One answer of a multi-choice question; odds is the saved XO "Yes" price in percent. */
export type QuestionOption = { key: string; label: string; odds: number | null; xo_slug: string | null };

export type Choice = string;

export const XO_BASE = "https://beta.xo.market";

export function xoMarketUrl(slug: string) {
  return `${XO_BASE}/markets/${slug}`;
}

/** Every choice of a question in display order, whatever its type. */
export function questionChoices(q: Pick<Question, "type" | "option_a_label" | "option_b_label" | "options">): QuestionOption[] {
  if (q.type === "multi") return q.options ?? [];
  if (q.type === "yes_no") {
    return [
      { key: "yes", label: "Yes", odds: null, xo_slug: null },
      { key: "no", label: "No", odds: null, xo_slug: null },
    ];
  }
  return [
    { key: "a", label: q.option_a_label ?? "Option A", odds: null, xo_slug: null },
    { key: "b", label: q.option_b_label ?? "Option B", odds: null, xo_slug: null },
  ];
}

// A game day starts at 08:00 Germany time; must match public.game_today() in the database.
const GAME_TZ = "Europe/Berlin";
const DROP_HOUR = 8;

const berlinClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: GAME_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function berlinParts(at: Date) {
  const parts = Object.fromEntries(berlinClock.formatToParts(at).map((p) => [p.type, p.value]));
  return { date: `${parts["year"]}-${parts["month"]}-${parts["day"]}`, h: Number(parts["hour"]), m: Number(parts["minute"]), s: Number(parts["second"]) };
}

/** Today's game day (YYYY-MM-DD): the Berlin date, rolling over at 08:00 rather than midnight. */
export function gameToday(): string {
  return berlinParts(new Date(Date.now() - DROP_HOUR * 3_600_000)).date;
}

/** Milliseconds until the next five drop at 08:00 Berlin time. */
export function msToNextDrop(): number {
  const now = new Date();
  const { h, m, s } = berlinParts(now);
  let secs = DROP_HOUR * 3600 - (h * 3600 + m * 60 + s);
  if (secs <= 0) secs += 24 * 3600;
  return secs * 1000 - now.getMilliseconds();
}

export function choiceLabel(q: Pick<Question, "type" | "option_a_label" | "option_b_label" | "options">, c: string | null) {
  if (c === "void") return "Void";
  if (c === TIMEOUT_CHOICE) return "Out of time";
  return questionChoices(q).find((o) => o.key === c)?.label ?? "—";
}

/** Seconds a player gets on a timed question, and the answer saved when it runs out. */
export const TIMER_SECONDS = 20;
export const TIMEOUT_CHOICE = "timeout";

/** Only allow well-formed https links to be rendered. */
export function safeHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready, userId: session?.user.id ?? null };
}

export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useIsAdmin(userId: string | null) {
  return useQuery({
    queryKey: ["is-admin", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", { _user_id: userId!, _role: "admin" });
      if (error) throw error;
      return !!data;
    },
  });
}

export function useToday(userId: string | null) {
  const today = gameToday();
  return useQuery({
    queryKey: ["today", userId, today],
    enabled: !!userId,
    queryFn: async () => {
      const { data: qs, error } = await supabase
        .from("questions")
        .select("*")
        .eq("play_date", today)
        .neq("status", "draft")
        .order("order_index");
      if (error) throw error;
      const ids = (qs ?? []).map((q) => q.id);
      const { data: ans, error: e2 } = ids.length
        ? await supabase.from("answers").select("question_id, choice").in("question_id", ids)
        : { data: [], error: null };
      if (e2) throw e2;
      return { questions: (qs ?? []) as Question[], answers: ans ?? [] };
    },
  });
}

/** Live XO odds by market slug for the questions' events; refreshed every minute. */
export function useXoOdds(questions: Pick<Question, "xo_event_slug">[]) {
  const events = [...new Set(questions.map((q) => q.xo_event_slug).filter((s): s is string => !!s))].sort();
  return useQuery({
    queryKey: ["xo-odds", events],
    enabled: events.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: () => getXoOdds({ data: { events } }),
  });
}

/** Live odds when available, otherwise the odds saved with the question. */
export function optionOdds(o: QuestionOption, live: Record<string, number> | undefined): number | null {
  return (o.xo_slug ? live?.[o.xo_slug] : undefined) ?? o.odds;
}

export function formatOdds(pct: number) {
  return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}

/** Odds as "out of 10", e.g. 36.75% -> "3.7"; whole numbers drop the ".0". */
export function oddsInTen(pct: number) {
  if (pct < 1) return "<0.1";
  return String(Math.round(pct) / 10);
}

export function useCrowd(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ["crowd", date],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("crowd_split", { _date: date });
      if (error) throw error;
      const map: Record<string, Record<string, number>> = {};
      for (const r of data ?? []) {
        map[r.question_id] ??= {};
        map[r.question_id][r.choice] = Number(r.votes);
      }
      return map;
    },
  });
}

export function useLeaderboard(period: "all" | "weekly", enabled: boolean) {
  return useQuery({
    queryKey: ["leaderboard", period],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leaderboard", { _period: period });
      if (error) throw error;
      return data ?? [];
    },
  });
}
