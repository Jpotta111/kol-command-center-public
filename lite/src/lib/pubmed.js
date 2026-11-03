// What kind of evidence each person authors, from PubMed publication types.
// PMIDs come from OpenAlex (matched to the exact author), so there is no name guessing.
// PubMed E-utilities are free and called straight from the browser. No key needed.

import { shortId } from "./openalex";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const GAP_MS = 360; // PubMed allows about 3 requests a second without a key
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const EVIDENCE_TYPES = [
  ["guidelines", "Guidelines"],
  ["trials", "Clinical trials"],
  ["meta", "Systematic reviews and meta-analyses"],
  ["reviews", "Reviews"],
  ["observational", "Observational studies"],
];

export function classify(pubtypes) {
  const t = pubtypes || [];
  const has = (s) => t.includes(s);
  return {
    guidelines: has("Practice Guideline") || has("Guideline") || has("Consensus Development Conference"),
    // Trial protocols describe a planned trial, not a result, so they do not count.
    trials: t.some((x) => /Clinical Trial|Randomized Controlled Trial/.test(x) && !/Protocol/i.test(x)),
    meta: has("Meta-Analysis") || has("Systematic Review"),
    reviews: has("Review") && !has("Systematic Review") && !has("Meta-Analysis"),
    observational: has("Observational Study"),
  };
}

function emptyStats() {
  return { indexed: 0, guidelines: 0, trials: 0, meta: 0, reviews: 0, observational: 0 };
}

function pmidOf(work) {
  const raw = work?.ids?.pmid || "";
  const m = String(raw).match(/(\d+)\s*$/);
  return m ? m[1] : null;
}

async function summaries(pmids, onBatch) {
  const out = {};
  const failed = new Set(); // PMIDs in batches PubMed never answered, so they are not silently treated as "no evidence"
  for (let i = 0; i < pmids.length; i += 180) {
    const batch = pmids.slice(i, i + 180);
    const url = `${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${batch.join(",")}`;
    let data = null;
    for (let attempt = 0; attempt < 3 && !data; attempt++) {
      try {
        const resp = await fetch(url);
        // Retry rate limits and passing server errors (502/503 etc.); give up on other errors.
        if (resp.status === 429 || resp.status >= 500) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        if (!resp.ok) break;
        data = await resp.json();
      } catch {
        await sleep(800);
      }
    }
    if (!data) for (const id of batch) failed.add(id);
    const result = data?.result || {};
    // esummary returns { uid, error } for IDs it has no record for; those are not indexed.
    for (const id of batch) if (result[id] && !result[id].error) out[id] = result[id].pubtype || [];
    onBatch?.(Math.min(i + 180, pmids.length), pmids.length);
    await sleep(GAP_MS);
  }
  return { out, failed };
}

const PAPER_CAP = 200; // OpenAlex pages read per person (2 x 100)

/**
 * For each person, count guidelines, trials, reviews and so on among their papers since fromYear.
 * onProgress(done, total) is called as people finish. Returns Map(personId -> stats).
 */
export async function evidenceProfiles(client, people, { fromYear, onProgress } = {}) {
  const stats = new Map();
  const pmidsByPerson = new Map();
  const cappedIds = new Set();
  let done = 0;

  // 1. PubMed IDs for each person's papers, from OpenAlex (4 people at a time).
  // If one worker fails, the others stop taking new people, so no progress update
  // arrives after the error and no extra OpenAlex calls are spent.
  const queue = [...people];
  let failed = false;
  const worker = async () => {
    while (queue.length && !failed) {
      const p = queue.shift();
      try {
        await pmidsFor(p);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  };
  async function pmidsFor(p) {
    const id = shortId(p.id);
    const pmids = new Set();
    for (let page = 1; page <= 2; page++) {
      const data = await client.get("/works", {
        filter: `author.id:${id},from_publication_date:${fromYear}-01-01`,
        per_page: 100,
        page,
        select: "id,ids",
      });
      const works = data.results || [];
      for (const w of works) {
        const pm = pmidOf(w);
        if (pm) pmids.add(pm);
      }
      if (works.length < 100) break;
      if (page === 2) cappedIds.add(p.id); // a full second page means there may be more papers than we read
    }
    if (failed) return;
    pmidsByPerson.set(p.id, [...pmids]);
    done += 1;
    onProgress?.(done, people.length * 2);
  }
  await Promise.all(Array.from({ length: Math.min(4, people.length) }, worker));

  // 2. Publication types from PubMed, fetched in shared batches.
  const all = [...new Set([...pmidsByPerson.values()].flat())];
  // Second half of the progress bar moves with each PubMed batch, so it does not sit at 50%.
  const total = people.length * 2;
  const { out: types, failed: failedPmids } = await summaries(all, (sent, n) =>
    onProgress?.(people.length + Math.floor((people.length * sent) / n), total)
  );

  for (const p of people) {
    const s = emptyStats();
    for (const pm of pmidsByPerson.get(p.id) || []) {
      if (failedPmids.has(pm)) s.skipped = (s.skipped || 0) + 1;
      if (!types[pm]) continue;
      s.indexed += 1;
      const c = classify(types[pm]);
      for (const k of Object.keys(c)) if (c[k]) s[k] += 1;
    }
    if (cappedIds.has(p.id)) s.capped = true;
    stats.set(p.id, s);
  }
  // Totals for the app to show a notice, so a PubMed outage never looks like "no evidence".
  stats.skippedPapers = failedPmids.size;
  stats.cappedPeople = people.filter((p) => cappedIds.has(p.id)).length;
  stats.paperCap = PAPER_CAP;
  onProgress?.(total, total);
  return stats;
}

/** People who author guidelines or trials, most guideline-heavy first. */
export function evidenceLeaders(people, stats, n = 5) {
  return people
    .map((p) => ({ p, s: stats.get(p.id) }))
    .filter(({ s }) => s && (s.guidelines > 0 || s.trials > 0))
    .sort((a, b) => b.s.guidelines - a.s.guidelines || b.s.trials - a.s.trials)
    .slice(0, n);
}
