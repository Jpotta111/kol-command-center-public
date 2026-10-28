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
export function buildNetwork(seeds, worksBySeed, { maxAuthorsPerPaper = 30, maxOthers = 60, maxShared = 300 } = {}) {
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

  for (const seed of seeds) {
    const sid = shortId(seed.id);
    for (const w of worksBySeed.get(sid) || []) {
      const auths = w.authorships || [];
      if (auths.length > maxAuthorsPerPaper) continue;
      const ref = workRef(w);
      for (const a of auths) {
        const id = shortId(a.author?.id);
        if (!id || id === sid) continue;
        const p = ensure(id, a.author?.display_name, a.institutions?.[0]?.display_name);
        if (!p.links.has(sid)) p.links.set(sid, new Map());
        p.links.get(sid).set(ref.id, ref);
      }
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
      category: p.isSeed ? "seed" : seedsConnected.length >= 2 ? "shared" : "other",
    };
  });

  const seedsOut = all.filter((p) => p.isSeed);
  const shared = all
    .filter((p) => p.category === "shared")
    .sort((a, b) => b.seedsConnected.length - a.seedsConnected.length || b.jointPapers.length - a.jointPapers.length)
    .slice(0, maxShared);
  const others = all
    .filter((p) => p.category === "other")
    .sort((a, b) => b.jointPapers.length - a.jointPapers.length)
    .slice(0, maxOthers);

  const kept = [...seedsOut, ...shared, ...others];
  const keptIds = new Set(kept.map((p) => p.id));

  const edges = [];
  for (const p of kept) {
    for (const [sid, works] of p.links) {
      if (!keptIds.has(sid)) continue;
      if (p.isSeed && p.id > sid) continue; // one edge per seed pair
      edges.push({ source: sid, target: p.id, weight: works.size });
    }
  }

  return { people: kept, edges };
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
