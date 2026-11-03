// List Audit: for a list of people (speakers, advisors, KOLs), count the guideline, trial and review
// evidence each one authors in PubMed, and flag the ones with none. Same free public data as the rest of Lite.

import { matchAuthor, shortId } from "./openalex";
import { evidenceProfiles } from "./pubmed";

export const FLAGS = {
  noMatch: "Could not find this person in OpenAlex",
  lowConfidence: "Possible name mix-up: check the match",
  noPapers: "No PubMed-indexed papers in this window",
  noEvidence: "No guideline, trial or review evidence found",
  unchecked: "PubMed could not check some of their papers",
};

/** Build one audit row from the input person, the OpenAlex match (or null) and PubMed stats (or undefined). */
export function auditRow(input, match, stats) {
  const base = {
    name: input.name || "",
    institution: input.institution || "",
    matchedName: match?.author?.display_name || "",
    matchedInstitution: match?.author?.last_known_institutions?.[0]?.display_name || "",
    confidence: match?.confidence || "",
    openalexId: match ? shortId(match.author.id) : "",
    guidelines: 0,
    trials: 0,
    meta: 0,
    reviews: 0,
    indexed: 0,
    flags: [],
  };
  if (!match) return { ...base, flags: [FLAGS.noMatch] };
  const s = stats || {};
  const row = {
    ...base,
    guidelines: s.guidelines || 0,
    trials: s.trials || 0,
    meta: s.meta || 0,
    reviews: s.reviews || 0,
    indexed: s.indexed || 0,
  };
  const flags = [];
  if (match.confidence === "low") flags.push(FLAGS.lowConfidence);
  if (s.skipped) flags.push(FLAGS.unchecked);
  if (row.indexed === 0) flags.push(FLAGS.noPapers);
  else if (row.guidelines + row.trials + row.meta + row.reviews === 0) flags.push(FLAGS.noEvidence);
  return { ...row, flags };
}

export function auditSummary(rows) {
  return {
    total: rows.length,
    noEvidence: rows.filter((r) => r.flags.includes(FLAGS.noEvidence)).length,
    noMatch: rows.filter((r) => r.flags.includes(FLAGS.noMatch)).length,
    lowConfidence: rows.filter((r) => r.flags.includes(FLAGS.lowConfidence)).length,
    withEvidence: rows.filter((r) => r.guidelines + r.trials + r.meta + r.reviews > 0).length,
  };
}

export function auditCsvRows(rows, fromYear) {
  return rows.map((r) => ({
    name: r.name,
    institution: r.institution,
    matched_openalex_name: r.matchedName,
    matched_institution: r.matchedInstitution,
    match_confidence: r.confidence,
    openalex_id: r.openalexId,
    [`pubmed_guidelines_since_${fromYear}`]: r.guidelines,
    [`pubmed_clinical_trials_since_${fromYear}`]: r.trials,
    [`pubmed_systematic_reviews_meta_since_${fromYear}`]: r.meta,
    [`pubmed_reviews_since_${fromYear}`]: r.reviews,
    pubmed_indexed_papers: r.indexed,
    flags: r.flags.join("; "),
  }));
}

/**
 * Run the audit. onProgress(text) gets short status messages.
 * Returns { rows, note } where note is a plain-language warning or "".
 */
export async function runAudit(client, people, { fromYear, onProgress } = {}) {
  const matches = [];
  for (let i = 0; i < people.length; i++) {
    onProgress?.(`Finding ${people[i].name || "person"} in OpenAlex (${i + 1} of ${people.length})`);
    let found = [];
    try {
      found = await matchAuthor(client, people[i]);
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    matches.push(found[0] || null);
  }
  const unique = [...new Map(matches.filter(Boolean).map((m) => [m.author.id, { id: m.author.id }])).values()];
  onProgress?.(`Checking PubMed for ${unique.length} people`);
  const stats = unique.length
    ? await evidenceProfiles(client, unique, {
        fromYear,
        onProgress: (d, t) => onProgress?.(`Checking PubMed (${Math.round((100 * d) / t)}%)`),
      })
    : new Map();
  const rows = people.map((p, i) => auditRow(p, matches[i], matches[i] ? stats.get(matches[i].author.id) : undefined));
  const notes = [];
  if (stats.skippedPapers) notes.push(`PubMed could not check ${stats.skippedPapers} papers, so some counts may be low.`);
  if (stats.cappedPeople) notes.push(`${stats.cappedPeople} people have more than ${stats.paperCap} papers; only the newest ${stats.paperCap} were read.`);
  return { rows, note: notes.join(" ") };
}
