// Minimal OpenAlex client that runs in the browser with the user's own key.
// Docs: https://developers.openalex.org

const BASE = "https://api.openalex.org";

export const WORK_SELECT = "id,doi,title,publication_year,cited_by_count,authorships";
export const AUTHOR_SELECT =
  "id,display_name,orcid,works_count,cited_by_count,summary_stats,last_known_institutions,topics";

export class OpenAlexError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function shortId(id) {
  if (!id) return "";
  return String(id).replace("https://openalex.org/", "").trim();
}

export function createClient({ apiKey = "", email = "", onCost } = {}) {
  let totalCost = 0;

  async function get(path, params = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    if (apiKey) qs.set("api_key", apiKey);
    if (email) qs.set("mailto", email);
    const url = `${BASE}${path}${qs.toString() ? `?${qs}` : ""}`;

    for (let attempt = 0; attempt < 4; attempt++) {
      let resp;
      try {
        resp = await fetch(url);
      } catch {
        if (attempt === 3) {
          throw new OpenAlexError("Could not reach OpenAlex. Check your internet connection.", 0);
        }
        await sleep(800 * (attempt + 1));
        continue;
      }

      if (resp.status === 429) {
        const body = await resp.json().catch(() => ({}));
        const msg = String(body.error || body.message || "");
        if (/budget|limit exceeded|daily/i.test(msg)) {
          throw new OpenAlexError(
            apiKey
              ? "Your OpenAlex daily budget is used up. It resets tomorrow."
              : "The free no-key OpenAlex budget for your network is used up. Add a free OpenAlex key to keep going.",
            429
          );
        }
        await sleep(1000 * 2 ** attempt);
        continue;
      }

      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = String(body.error || body.message || resp.statusText || "Request failed");
        if (resp.status === 401 || resp.status === 403) {
          throw new OpenAlexError(
            apiKey
              ? "OpenAlex did not accept your API key. Check it on the Keys step."
              : "OpenAlex needs a free API key for this request. Add one on the Keys step.",
            resp.status
          );
        }
        if (resp.status === 404) throw new OpenAlexError("Not found in OpenAlex.", 404);
        throw new OpenAlexError(`OpenAlex error (${resp.status}): ${msg}`, resp.status);
      }

      const cost = Number(body?.meta?.cost_usd);
      if (Number.isFinite(cost) && cost > 0) {
        totalCost += cost;
        onCost?.(totalCost, cost);
      }
      return body;
    }
    throw new OpenAlexError("OpenAlex is rate limiting requests. Wait a minute and try again.", 429);
  }

  return { get, getTotalCost: () => totalCost };
}

export async function testOpenAlexKey(apiKey) {
  if (!apiKey) return { ok: false, message: "No key entered." };
  try {
    const resp = await fetch(`${BASE}/works?per_page=1&select=id&api_key=${encodeURIComponent(apiKey)}`);
    if (resp.ok) return { ok: true, message: "Key works." };
    if (resp.status === 401 || resp.status === 403) return { ok: false, message: "OpenAlex rejected this key." };
    return { ok: false, message: `OpenAlex returned an error (${resp.status}). Try again in a minute.` };
  } catch {
    return { ok: false, message: "Could not reach OpenAlex." };
  }
}

// ---------- Inputs ----------

const DOI_RE = /10\.\d{4,9}\/[^\s?#]+/i;

export function extractDoi(text) {
  const m = String(text || "").match(DOI_RE);
  return m ? m[0].replace(/[.,;\]]+$/, "") : null;
}

/** Find a paper by DOI, OpenAlex work ID or URL, or title search. Returns a list of candidates. */
export async function findPapers(client, input) {
  const text = String(input || "").trim();
  if (!text) return [];
  const doi = extractDoi(text);
  if (doi) {
    const w = await client.get(`/works/doi:${encodeURIComponent(doi)}`, { select: WORK_SELECT });
    return [w];
  }
  const wid = text.match(/\bW\d{4,}\b/i);
  if (wid) {
    const w = await client.get(`/works/${wid[0].toUpperCase()}`, { select: WORK_SELECT });
    return [w];
  }
  const data = await client.get("/works", { search: text, per_page: 6, select: WORK_SELECT });
  return data.results || [];
}

/** Topic search: most-cited recent papers on a topic, aggregated to their most frequent authors. */
export async function topicAuthors(client, topic, { fromYear, pages = 2, onProgress } = {}) {
  const counts = new Map();
  for (let page = 1; page <= pages; page++) {
    onProgress?.(`Scanning papers on "${topic}" (page ${page} of ${pages})`);
    const data = await client.get("/works", {
      search: topic,
      filter: `from_publication_date:${fromYear}-01-01,type:article|review`,
      sort: "cited_by_count:desc",
      per_page: 100,
      page,
      select: WORK_SELECT,
    });
    const works = data.results || [];
    for (const w of works) {
      const auths = w.authorships || [];
      if (auths.length > 40) continue; // skip huge consortium papers
      for (const a of auths) {
        const id = shortId(a.author?.id);
        if (!id) continue;
        const cur = counts.get(id) || {
          id,
          display_name: a.author.display_name,
          institution: a.institutions?.[0]?.display_name || "",
          papers: 0,
          citations: 0,
        };
        cur.papers += 1;
        cur.citations += w.cited_by_count || 0;
        if (!cur.institution && a.institutions?.[0]?.display_name) cur.institution = a.institutions[0].display_name;
        counts.set(id, cur);
      }
    }
    if (works.length < 100) break;
  }
  return [...counts.values()].sort((a, b) => b.papers - a.papers || b.citations - a.citations);
}

/** Match a person's name (plus optional institution) to OpenAlex author candidates. */
export async function matchAuthor(client, { name, institution, orcid, openalexId }) {
  if (openalexId) {
    const a = await client.get(`/authors/${shortId(openalexId)}`, { select: AUTHOR_SELECT });
    return [{ author: a, confidence: "exact" }];
  }
  if (orcid) {
    const clean = String(orcid).replace(/^https?:\/\/orcid\.org\//, "").trim();
    try {
      const a = await client.get(`/authors/orcid:${clean}`, { select: AUTHOR_SELECT });
      return [{ author: a, confidence: "exact" }];
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }
  if (!name) return [];
  const data = await client.get("/authors", { search: name, per_page: 5, select: AUTHOR_SELECT });
  const results = data.results || [];
  const inst = String(institution || "").toLowerCase();
  const scored = results.map((a) => {
    const insts = (a.last_known_institutions || [])
      .map((i) => (i.display_name || "").toLowerCase())
      .filter(Boolean);
    const instHit = inst && insts.some((x) => x.includes(inst) || inst.includes(x));
    return { author: a, instHit, works: a.works_count || 0 };
  });
  scored.sort((x, y) => Number(y.instHit) - Number(x.instHit) || y.works - x.works);
  return scored.map((s, i) => ({
    author: s.author,
    confidence: s.instHit ? "high" : i === 0 && scored.length === 1 ? "medium" : "low",
  }));
}

export async function authorsByIds(client, ids) {
  const out = [];
  const unique = [...new Set(ids.map(shortId).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const data = await client.get("/authors", {
      filter: `openalex:${batch.join("|")}`,
      per_page: 50,
      select: AUTHOR_SELECT,
    });
    out.push(...(data.results || []));
  }
  return out;
}

/** Recent works for one author (up to `maxWorks`, newest first). */
export async function recentWorks(client, authorId, { fromYear, maxWorks = 200 } = {}) {
  const works = [];
  const pages = Math.ceil(maxWorks / 100);
  for (let page = 1; page <= pages; page++) {
    const data = await client.get("/works", {
      filter: `author.id:${shortId(authorId)},from_publication_date:${fromYear}-01-01`,
      sort: "publication_date:desc",
      per_page: 100,
      page,
      select: WORK_SELECT,
    });
    const batch = data.results || [];
    works.push(...batch);
    if (batch.length < 100) break;
  }
  return works.slice(0, maxWorks);
}
