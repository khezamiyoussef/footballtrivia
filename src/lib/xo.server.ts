// Reads XO Market event data from the public event page. XO has no documented API, but each
// event page embeds its data (title + one market per outcome with live prices) as JSON.

export type XoEvent = {
  slug: string;
  title: string;
  markets: { slug: string; label: string; odds: number; status: string }[];
};

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; event: XoEvent }>();

/** Returns the bracket-balanced JSON array or object starting at text[from], skipping string contents. */
function sliceJson(text: string, from: number): string {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return text.slice(from, i + 1);
    }
  }
  throw new Error("XO page data is cut off");
}

type RawMarket = {
  groupTitle: string;
  market: { slug: string; status: string; outcomes: { title: string; currentPrice: string }[] };
};

export async function fetchXoEvent(slug: string): Promise<XoEvent> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.event;

  const res = await fetch(`https://beta.xo.market/event/${slug}`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`XO event not found (${res.status})`);
  const html = await res.text();
  // The data sits inside a JS string literal, so undo one level of escaping.
  const text = html.replace(/\\\\/g, "\u0000").replace(/\\"/g, '"').replace(/\u0000/g, "\\");

  const at = text.indexOf(`"slug":"${slug}","title":"`);
  if (at < 0) throw new Error("Couldn't read this XO event page");
  const title = /"title":"([^"]+)"/.exec(text.slice(at))?.[1] ?? slug;
  const marketsAt = text.indexOf('"markets":[', at);
  if (marketsAt < 0) throw new Error("This XO event has no markets");
  const raw = JSON.parse(sliceJson(text, marketsAt + '"markets":'.length)) as RawMarket[];

  const event: XoEvent = {
    slug,
    title,
    markets: raw.map((m) => {
      const yes = m.market.outcomes.find((o) => o.title === "Yes") ?? m.market.outcomes[0];
      // Prices are USDC with 6 decimals: 367500 = $0.3675 = 36.75% chance.
      return { slug: m.market.slug, label: m.groupTitle, odds: Number(yes?.currentPrice ?? 0) / 10_000, status: m.market.status };
    }),
  };
  cache.set(slug, { at: Date.now(), event });
  return event;
}
