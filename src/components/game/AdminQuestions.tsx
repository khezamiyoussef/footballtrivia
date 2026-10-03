import { useEffect, useRef, useState, type ReactNode } from "react";
import { Reorder, useDragControls } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpRight, ChevronLeft, ChevronRight, GripVertical, Timer, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { choiceLabel, formatOdds, questionChoices, gameToday, TIMER_SECONDS, XO_BASE, type Question, type QuestionOption } from "@/lib/game";
import { getXoEvent } from "@/lib/xo.functions";
import { cn } from "@/lib/utils";

const SLOTS = [1, 2, 3, 4, 5];

function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function prettyDate(date: string) {
  return new Date(date + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** Admin tool: write each day's five questions, publish them, and mark results. */
export function AdminQuestions() {
  const [date, setDate] = useState(gameToday());
  const qc = useQueryClient();
  const key = ["admin-questions", date];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("questions").select("*").eq("play_date", date).order("order_index");
      if (error) throw error;
      return (data ?? []) as Question[];
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["today"] });
  };

  const byId = new Map((data ?? []).map((q) => [q.id, q]));
  const usedSlots = new Set((data ?? []).map((q) => q.order_index));
  const emptySlots = SLOTS.filter((s) => !usedSlots.has(s));
  const drafts = (data ?? []).filter((q) => q.status === "draft");

  // Drag order lives locally while dragging and is saved on drop; it resets whenever the data reloads.
  const [order, setOrder] = useState<string[]>([]);
  const orderRef = useRef(order);
  orderRef.current = order;
  useEffect(() => setOrder((data ?? []).map((q) => q.id)), [data]);

  async function saveOrder(ids = orderRef.current) {
    const changes = ids.map((id, i) => ({ id, order_index: i + 1 })).filter((c) => byId.get(c.id)?.order_index !== c.order_index);
    if (changes.length === 0) return;
    const results = await Promise.all(changes.map((c) => supabase.from("questions").update({ order_index: c.order_index }).eq("id", c.id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) toast.error(failed.error.message);
    else toast.success("New order saved");
    refresh();
  }

  /** Keyboard alternative to dragging: move a question one place up or down. */
  function move(id: string, by: -1 | 1) {
    const ids = [...orderRef.current];
    const from = ids.indexOf(id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    setOrder(ids);
    void saveOrder(ids);
  }

  async function publishAll() {
    const written = data?.length ?? 0;
    if (written < 5 && !confirm(`Only ${written} of 5 questions are written. Publish anyway?`)) return;
    const { error } = await supabase.from("questions").update({ status: "live" }).eq("play_date", date).eq("status", "draft");
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Questions are live");
    refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="secondary" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft />
        </Button>
        <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 flex-1 rounded-xl border-2 bg-card" />
        <Button size="icon" variant="secondary" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
          <ChevronRight />
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="font-display text-lg tracking-wide">
          {prettyDate(date)} {date === gameToday() && <span className="text-destructive">· Today</span>}
        </p>
        {date !== gameToday() && (
          <button className="text-sm font-semibold text-primary underline" onClick={() => setDate(gameToday())}>
            Today
          </button>
        )}
      </div>

      {drafts.length > 0 && (
        <Button variant="hero" size="xl" className="mt-4 w-full" onClick={publishAll}>
          Publish {drafts.length} draft{drafts.length > 1 ? "s" : ""}
        </Button>
      )}

      <div className="mt-4 space-y-3">
        {isLoading && <div className="h-40 animate-pulse rounded-2xl bg-card" />}
        {error && <p className="text-destructive">Couldn't load questions.</p>}
        {!isLoading && order.length > 1 && (
          <p className="text-xs text-muted-foreground">Drag a question by its ⠿ handle to change the order.</p>
        )}
        {!isLoading && (
          <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-3">
            {order.map((id) => {
              const q = byId.get(id);
              return q ? <DraggableQuestion key={id} q={q} onChange={refresh} onDrop={() => void saveOrder()} onMove={(by) => move(id, by)} /> : null;
            })}
          </Reorder.Group>
        )}
        {!isLoading && emptySlots.map((slot) => <EmptySlot key={slot} date={date} slot={slot} onChange={refresh} />)}
      </div>
    </div>
  );
}

const TYPE_LABEL: Record<Question["type"], string> = { yes_no: "Yes or no", which_first: "Which first", multi: "From XO" };

const STATUS_STYLE: Record<Question["status"], string> = {
  draft: "bg-secondary text-foreground",
  live: "bg-accent text-accent-foreground",
  resolved: "bg-primary text-primary-foreground",
  void: "bg-muted text-muted-foreground",
};

function DraggableQuestion({ q, onChange, onDrop, onMove }: { q: Question; onChange: () => void; onDrop: () => void; onMove: (by: -1 | 1) => void }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={q.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      whileDrag={{ scale: 1.03, rotate: -1, zIndex: 20 }}
      className="relative"
    >
      <QuestionCard
        q={q}
        onChange={onChange}
        dragHandle={
          <button
            type="button"
            aria-label={`Move question ${q.order_index}. Drag, or use the arrow keys`}
            onPointerDown={(e) => controls.start(e)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") onMove(-1);
              else if (e.key === "ArrowDown") onMove(1);
              else return;
              e.preventDefault();
            }}
            className="-ml-1 cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-gold/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          >
            <GripVertical className="size-5" />
          </button>
        }
      />
    </Reorder.Item>
  );
}

function QuestionCard({ q, onChange, dragHandle }: { q: Question; onChange: () => void; dragHandle?: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [changingResult, setChangingResult] = useState(false);

  if (editing) {
    return <QuestionForm date={q.play_date} slot={q.order_index} existing={q} onDone={() => { setEditing(false); onChange(); }} onCancel={() => setEditing(false)} />;
  }

  async function update(patch: Partial<Question>, message: string) {
    const { error } = await supabase.from("questions").update(patch).eq("id", q.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(message);
    onChange();
  }

  async function remove() {
    if (!confirm("Delete this question?")) return;
    const { error } = await supabase.from("questions").delete().eq("id", q.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Question deleted");
    onChange();
  }

  async function resolve(outcome: string) {
    const label = outcome === "void" ? "VOID (no points for anyone)" : choiceLabel(q, outcome);
    if (!confirm(`Mark the result as: ${label}?`)) return;
    const { error } = await supabase.rpc("resolve_question", { _question_id: q.id, _outcome: outcome });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Result saved, points updated");
    setChangingResult(false);
    onChange();
  }

  async function toggleCombo(on: boolean) {
    const { error } = await supabase.from("questions").update({ is_double: on }).eq("id", q.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Already scored: re-run the result so points reflect the new multiplier.
    if (q.status === "resolved" && q.outcome) {
      const { error: e2 } = await supabase.rpc("resolve_question", { _question_id: q.id, _outcome: q.outcome });
      if (e2) {
        toast.error(e2.message);
        return;
      }
    }
    toast.success(on ? "2× combo on: worth 20 points" : "Combo off: back to 10 points");
    onChange();
  }

  async function toggleTimer(on: boolean) {
    const { error } = await supabase.from("questions").update({ has_timer: on }).eq("id", q.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(on ? `Timer on: ${TIMER_SECONDS} seconds to answer` : "Timer off");
    onChange();
  }

  const outcomes = questionChoices(q).map((o) => o.key);
  const showResolve = q.status === "live" || changingResult;

  return (
    <div className={cn("ticket p-4", q.is_double && "combo")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-display text-sm tracking-[0.2em] text-muted-foreground">
          {dragHandle}
          Q{q.order_index} · {TYPE_LABEL[q.type]}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label
            className={cn(
              "flex cursor-pointer select-none items-center gap-1.5 rounded-md border-2 border-border px-2 py-0.5 font-display text-xs tracking-wider transition-colors",
              q.is_double ? "bg-destructive text-gold" : "bg-card text-muted-foreground hover:bg-gold/40",
            )}
          >
            <input
              type="checkbox"
              checked={q.is_double}
              onChange={(e) => toggleCombo(e.target.checked)}
              className="size-3.5 accent-[#d7263d]"
            />
            <Zap className={cn("size-3", q.is_double && "fill-current")} /> 2× combo
          </label>
          <label
            className={cn(
              "flex cursor-pointer select-none items-center gap-1.5 rounded-md border-2 border-border px-2 py-0.5 font-display text-xs tracking-wider transition-colors",
              q.has_timer ? "bg-primary text-gold" : "bg-card text-muted-foreground hover:bg-gold/40",
            )}
          >
            <input
              type="checkbox"
              checked={q.has_timer}
              onChange={(e) => toggleTimer(e.target.checked)}
              className="size-3.5 accent-[#3d195b]"
            />
            <Timer className="size-3" /> {TIMER_SECONDS}s timer
          </label>
          <span className={cn("rounded-md border-2 border-border px-2 font-display text-xs tracking-wider", STATUS_STYLE[q.status])}>{q.status}</span>
        </div>
      </div>
      <p className="mt-2 font-bold">{q.text}</p>
      {q.type === "which_first" && (
        <p className="mt-1 text-sm text-muted-foreground">
          A: {q.option_a_label} · B: {q.option_b_label}
        </p>
      )}
      {q.type === "multi" && (
        <p className="mt-1 text-sm text-muted-foreground">
          {questionChoices(q).map((o) => `${o.label}${o.odds !== null ? ` (${formatOdds(o.odds)})` : ""}`).join(" · ")}
        </p>
      )}
      {q.xo_url && (
        <a href={q.xo_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary underline">
          View on XO <ArrowUpRight className="size-3" />
        </a>
      )}
      {(q.status === "resolved" || q.status === "void") && (
        <p className="mt-2 text-sm">
          Result: <span className="font-bold">{choiceLabel(q, q.outcome)}</span>
        </p>
      )}

      {q.status === "draft" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
          <Button size="sm" variant="secondary" onClick={() => update({ status: "live" }, "Question is live")}>Go live</Button>
          <Button size="sm" variant="destructive" onClick={remove}>Delete</Button>
        </div>
      )}

      {showResolve && (
        <div className="mt-3">
          <p className="mb-2 font-display text-xs tracking-[0.2em] text-muted-foreground">What happened?</p>
          <div className="grid grid-cols-2 gap-2">
            {outcomes.map((o) => (
              <Button key={o} variant="pick" className="min-h-12 rounded-xl text-lg" onClick={() => resolve(o)}>
                {choiceLabel(q, o)}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => resolve("void")}>Void question</Button>
            {changingResult && <Button size="sm" variant="ghost" onClick={() => setChangingResult(false)}>Cancel</Button>}
          </div>
        </div>
      )}

      {(q.status === "resolved" || q.status === "void") && !changingResult && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setChangingResult(true)}>Change result</Button>
      )}
    </div>
  );
}

function EmptySlot({ date, slot, onChange }: { date: string; slot: number; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  if (open) return <QuestionForm date={date} slot={slot} onDone={() => { setOpen(false); onChange(); }} onCancel={() => setOpen(false)} />;
  return (
    <button
      onClick={() => setOpen(true)}
      className="flex w-full items-center justify-center rounded-xl border-2 border-dashed border-border/50 p-5 font-display tracking-widest text-muted-foreground hover:bg-card"
    >
      + Add question {slot}
    </button>
  );
}

function QuestionForm({
  date,
  slot,
  existing,
  onDone,
  onCancel,
}: {
  date: string;
  slot: number;
  existing?: Question;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<Question["type"]>(existing?.type ?? "multi");
  const [text, setText] = useState(existing?.text ?? "");
  const [a, setA] = useState(existing?.option_a_label ?? "");
  const [b, setB] = useState(existing?.option_b_label ?? "");
  const [xoLink, setXoLink] = useState(existing?.xo_url ?? "");
  const [xoSlug, setXoSlug] = useState(existing?.xo_event_slug ?? null);
  const [xoOptions, setXoOptions] = useState<QuestionOption[]>(existing?.options ?? []);
  const [busy, setBusy] = useState(false);

  async function fetchXo() {
    const slug = /xo\.market\/event\/([a-z0-9-]+)/.exec(xoLink.trim())?.[1];
    if (!slug) {
      toast.error("Paste an XO event link, like https://beta.xo.market/event/…");
      return;
    }
    setBusy(true);
    try {
      const event = await getXoEvent({ data: { slug } });
      const active = event.markets.filter((m) => m.status === "ACTIVE").sort((x, y) => y.odds - x.odds).slice(0, 8);
      if (active.length < 2) throw new Error("This XO event has fewer than 2 open outcomes");
      setXoSlug(slug);
      setXoOptions(active.map((m, i) => ({ key: `o${i}`, label: m.label, odds: m.odds, xo_slug: m.slug })));
      if (!text.trim()) setText(event.title.endsWith("?") ? event.title : `${event.title}?`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't fetch that XO event");
    } finally {
      setBusy(false);
    }
  }

  async function save(status: "draft" | "live") {
    const t = text.trim();
    const problem =
      t.length < 5 || t.length > 200
        ? "Question must be 5 to 200 characters"
        : type === "which_first" && (!a.trim() || !b.trim())
          ? "Fill in both options"
          : type === "multi" && xoOptions.length < 2
            ? "Fetch the XO event first"
            : null;
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    const row = {
      play_date: date,
      order_index: slot,
      type,
      text: t,
      option_a_label: type === "which_first" ? a.trim() : null,
      option_b_label: type === "which_first" ? b.trim() : null,
      options: type === "multi" ? xoOptions : null,
      xo_event_slug: type === "multi" ? xoSlug : null,
      xo_url: type === "multi" && xoSlug ? `${XO_BASE}/event/${xoSlug}` : null,
      status,
    };
    const { error } = existing
      ? await supabase.from("questions").update(row).eq("id", existing.id)
      : await supabase.from("questions").insert(row);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "live" ? "Question is live" : "Draft saved");
    onDone();
  }

  return (
    <div className="ticket space-y-3 p-4">
      <p className="font-display text-sm tracking-[0.2em] text-muted-foreground">Question {slot}</p>
      <div className="inline-flex rounded-full border-2 border-border bg-card p-1">
        {(["multi", "yes_no", "which_first"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn("rounded-full px-3 py-1 font-display text-xs tracking-wider", type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {type === "multi" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={xoLink}
              onChange={(e) => setXoLink(e.target.value)}
              placeholder="https://beta.xo.market/event/…"
              className="rounded-xl border-2 bg-card"
            />
            <Button size="sm" variant="secondary" className="h-9" disabled={busy} onClick={fetchXo}>Fetch</Button>
          </div>
          {xoOptions.length > 0 && (
            <ul className="space-y-1 rounded-xl border-2 border-dashed border-border/50 p-3 text-sm">
              {xoOptions.map((o) => (
                <li key={o.key} className="flex justify-between gap-2">
                  <span className="font-semibold">{o.label}</span>
                  <span className="tabular text-muted-foreground">{o.odds !== null ? formatOdds(o.odds) : "–"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={200}
        rows={3}
        placeholder={type === "yes_no" ? "Will Haaland score this weekend?" : type === "multi" ? "Fetch an XO event to fill this in" : "Who leaves their job first?"}
        className="w-full rounded-xl border-2 border-border bg-card p-3 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {type === "which_first" && (
        <div className="grid grid-cols-2 gap-2">
          <Input value={a} onChange={(e) => setA(e.target.value)} maxLength={60} placeholder="Option A" className="rounded-xl border-2 bg-card" />
          <Input value={b} onChange={(e) => setB(e.target.value)} maxLength={60} placeholder="Option B" className="rounded-xl border-2 bg-card" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => save("draft")}>Save draft</Button>
        <Button size="sm" disabled={busy} onClick={() => save("live")}>Save &amp; go live</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
