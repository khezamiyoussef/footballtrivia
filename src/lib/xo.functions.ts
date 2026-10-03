import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const slugSchema = z.string().regex(/^[a-z0-9-]{3,120}$/);

/** Live XO odds (percent) keyed by market slug, for the given event slugs. */
export const getXoOdds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ events: z.array(slugSchema).max(10) }).parse(d))
  .handler(async ({ data }) => {
    const { fetchXoEvent } = await import("./xo.server");
    const odds: Record<string, number> = {};
    const results = await Promise.allSettled(data.events.map((slug) => fetchXoEvent(slug)));
    for (const r of results) {
      if (r.status === "fulfilled") for (const m of r.value.markets) odds[m.slug] = m.odds;
    }
    return odds;
  });

/** Admin import: an XO event's title and outcomes, ready to save as a multi-choice question. */
export const getXoEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ slug: slugSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { fetchXoEvent } = await import("./xo.server");
    return fetchXoEvent(data.slug);
  });
