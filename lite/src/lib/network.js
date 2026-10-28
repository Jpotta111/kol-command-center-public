import { shortId } from "./openalex";

function workRef(w) {
  return {
    id: shortId(w.id),
    title: w.title || "(untitled)",
    year: w.publication_year,
    doi: w.doi || "",
    cited_by_count: w.cited_by_count || 0,
  };
}

/**
 * Build the collaboration network around a set of seed researchers.
 *
 * seeds: [{ id, display_name }]
 * worksBySeed: Map(seedId -> works[])
 * Returns { people: Person[], edges: Edge[] } where a Person is a seed or a
 * co-author, with the papers that connect them to each seed.
 */
/** How many of your starting researchers someone must work with to count as "shared". */
export function sharedThreshold(seedCount) {
  if (seedCount <= 4) return 2;
  if (seedCount <= 10) return 3;
  return 4;
}

export function buildNetwork(seeds, worksBySeed, { maxAuthorsPerPaper = 30, maxOthers = 100, maxShared = 150 } = {}) {
  const sharedMin = sharedThreshold(seeds.length);
  const seedIds = new Set(seeds.map((s) => shortId(s.id)));
  const people = new Map();

  function ensure(id, name, institution) {
    let p = people.get(id);
    if (!p) {
      p = {
        id,
        display_name: name || id,
        institution: institution || "",
        isSeed: seedIds.has(id),
        links: new Map(), // seedId -> Map(workId -> workRef)
      };
      people.set(id, p);
    }
    if (!p.institution && institution) p.institution = institution;
    return p;
  }

  for (const s of seeds) ensure(shortId(s.id), s.display_name, s.institution);

  // Papers shared by two starting researchers, keyed by the sorted ID pair and merged from
  // both researchers' paper lists (each list is capped, so one side may miss a paper).
  const seedPairs = new Map();
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const seed of seeds) {
    const sid = shortId(seed.id);
    for (const w of worksBySeed.get(sid) || []) {
      const auths = w.authorships || [];
      if (auths.length > maxAuthorsPerPaper) continue;
      const ref = workRef(w);
      for (const a of auths) {
        const id = shortId(a.author?.id);
        if (!id || id === sid) continue;
        if (seedIds.has(id)) {
          const k = pairKey(id, sid);
          if (!seedPairs.has(k)) seedPairs.set(k, new Map());
          seedPairs.get(k).set(ref.id, ref);
          continue;
        }
        const p = ensure(id, a.author?.display_name, a.institutions?.[0]?.display_name);
        if (!p.links.has(sid)) p.links.set(sid, new Map());
        p.links.get(sid).set(ref.id, ref);
      }
    }
  }

  for (const [k, works] of seedPairs) {
    const [a, b] = k.split("|");
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      const p = people.get(x);
      if (!p.links.has(y)) p.links.set(y, new Map());
      for (const [wid, ref] of works) p.links.get(y).set(wid, ref);
    }
  }

  const all = [...people.values()].map((p) => {
    const seedsConnected = [...p.links.keys()];
    const papers = new Map();
    for (const m of p.links.values()) for (const [k, v] of m) papers.set(k, v);
    const jointPapers = [...papers.values()].sort((a, b) => (b.year || 0) - (a.year || 0));
    return {
      ...p,
      seedsConnected,
      jointPapers,
      lastJointYear: jointPapers[0]?.year || null,
      category: p.isSeed ? "seed" : seedsConnected.length >= sharedMin ? "shared" : "other",
    };
  });

  const seedsOut = all.filter((p) => p.isSeed);
  const shared = all
    .filter((p) => p.category === "shared")
    .sort((a, b) => b.seedsConnected.length - a.seedsConnected.length || b.jointPapers.length - a.jointPapers.length)
    .slice(0, maxShared);
  const others = all
    .filter((p) => p.category === "other")
    .sort((a, b) => b.seedsConnected.length - a.seedsConnected.length || b.jointPapers.length - a.jointPapers.length)
    .slice(0, maxOthers);

  const kept = [...seedsOut, ...shared, ...others];
  const keptIds = new Set(kept.map((p) => p.id));

  const edges = [];
  for (const p of kept) {
    if (p.isSeed) continue;
    for (const [sid, works] of p.links) {
      if (keptIds.has(sid)) edges.push({ source: sid, target: p.id, weight: works.size });
    }
  }
  for (const [k, works] of seedPairs) {
    const [a, b] = k.split("|");
    edges.push({ source: a, target: b, weight: works.size });
  }

  return { people: kept, edges, sharedMin };
}

/** Merge OpenAlex author records (h-index, ORCID, topics) into people. */
export function enrichPeople(people, authorRecords) {
  const byId = new Map(authorRecords.map((a) => [shortId(a.id), a]));
  return people.map((p) => {
    const a = byId.get(p.id);
    if (!a) return p;
    return {
      ...p,
      display_name: a.display_name || p.display_name,
      institution: a.last_known_institutions?.[0]?.display_name || p.institution,
      country: a.last_known_institutions?.[0]?.country_code || "",
      orcid: a.orcid || "",
      h_index: a.summary_stats?.h_index ?? null,
      works_count: a.works_count ?? null,
      cited_by_count: a.cited_by_count ?? null,
      topics: (a.topics || []).slice(0, 4).map((t) => t.display_name),
    };
  });
}

/** Rank non-seed people: more of your KOLs connected first, then more joint papers, then h-index. */
export function rankPeople(people) {
  return [...people].sort((a, b) => {
    if (a.isSeed !== b.isSeed) return a.isSeed ? -1 : 1;
    return (
      b.seedsConnected.length - a.seedsConnected.length ||
      b.jointPapers.length - a.jointPapers.length ||
      (b.h_index || 0) - (a.h_index || 0)
    );
  });
}

export function toCsvRows(people, seedNames) {
  return rankPeople(people).map((p) => ({
    name: p.display_name,
    type: p.isSeed ? "Starting researcher" : p.category === "shared" ? "Shared collaborator" : "Collaborator",
    institution: p.institution || "",
    country: p.country || "",
    connected_to: p.seedsConnected.map((id) => seedNames.get(id) || id).join("; "),
    kols_connected: p.isSeed ? "" : p.seedsConnected.length,
    joint_papers: p.isSeed ? "" : p.jointPapers.length,
    latest_joint_paper_year: p.isSeed ? "" : p.lastJointYear || "",
    h_index: p.h_index ?? "",
    total_works: p.works_count ?? "",
    total_citations: p.cited_by_count ?? "",
    topics: (p.topics || []).join("; "),
    orcid: p.orcid || "",
    openalex: `https://openalex.org/${p.id}`,
    example_joint_papers: p.jointPapers
      .slice(0, 3)
      .map((w) => `${w.title} (${w.year || "n.d."})${w.doi ? ` ${w.doi}` : ""}`)
      .join(" | "),
  }));
}

/**
 * Plain-language takeaways shown above the results.
 * people must already be enriched and ranked.
 */
export function computeInsights(people, edges, seedNames) {
  const seeds = people.filter((p) => p.isSeed);
  const nonSeeds = people.filter((p) => !p.isSeed);

  const connectors = nonSeeds
    .filter((p) => p.seedsConnected.length >= 2)
    .slice(0, 5)
    .map((p) => ({ id: p.id, name: p.display_name, institution: p.institution, count: p.seedsConnected.length }));

  const instCounts = new Map();
  for (const p of nonSeeds.filter((x) => x.category === "shared")) {
    if (!p.institution) continue;
    instCounts.set(p.institution, (instCounts.get(p.institution) || 0) + 1);
  }
  const institutions = [...instCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const seedIdSet = new Set(seeds.map((s) => s.id));
  const pairs = edges
    .filter((e) => seedIdSet.has(e.source) && seedIdSet.has(e.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((e) => ({ a: seedNames.get(e.source), b: seedNames.get(e.target), papers: e.weight, ids: [e.source, e.target] }));

  // Starting researchers who share no collaborators with anyone else on the list.
  const reach = new Map(seeds.map((s) => [s.id, 0]));
  for (const p of nonSeeds) {
    if (p.seedsConnected.length < 2) continue;
    for (const sid of p.seedsConnected) reach.set(sid, (reach.get(sid) || 0) + 1);
  }
  for (const pr of pairs) for (const id of pr.ids) reach.set(id, (reach.get(id) || 0) + 1);
  const isolated = seeds.filter((s) => !reach.get(s.id)).map((s) => ({ id: s.id, name: s.display_name }));

  const thisYear = new Date().getFullYear();
  const activeShared = nonSeeds.filter((p) => p.category === "shared" && p.lastJointYear >= thisYear - 1).length;

  return { connectors, institutions, pairs, isolated, activeShared };
}
