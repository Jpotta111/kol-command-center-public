import { describe, it, expect } from "vitest";
import { auditRow, auditSummary, auditCsvRows, FLAGS } from "../../src/lib/audit";

const match = (conf = "high") => ({
  author: { id: "https://openalex.org/A1", display_name: "Ann Alpha", last_known_institutions: [{ display_name: "Test University" }] },
  confidence: conf,
});

describe("auditRow", () => {
  it("flags a person who could not be found", () => {
    const r = auditRow({ name: "Nobody" }, null, undefined);
    expect(r.flags).toEqual([FLAGS.noMatch]);
    expect(r.openalexId).toBe("");
  });

  it("flags no evidence when papers exist but none are guidelines, trials or reviews", () => {
    const r = auditRow({ name: "Ann" }, match(), { indexed: 4, guidelines: 0, trials: 0, meta: 0, reviews: 0, observational: 2 });
    expect(r.flags).toEqual([FLAGS.noEvidence]);
    expect(r.openalexId).toBe("A1");
  });

  it("does not flag no evidence when there is a review or meta-analysis", () => {
    expect(auditRow({ name: "A" }, match(), { indexed: 3, guidelines: 0, trials: 0, meta: 1, reviews: 0 }).flags).toEqual([]);
    expect(auditRow({ name: "A" }, match(), { indexed: 3, guidelines: 0, trials: 0, meta: 0, reviews: 2 }).flags).toEqual([]);
  });

  it("uses a different flag when there are no indexed papers at all", () => {
    const r = auditRow({ name: "A" }, match(), { indexed: 0, guidelines: 0, trials: 0, meta: 0, reviews: 0 });
    expect(r.flags).toEqual([FLAGS.noPapers]);
  });

  it("adds name-check and PubMed-gap flags", () => {
    const r = auditRow({ name: "A" }, match("low"), { indexed: 2, guidelines: 1, trials: 0, meta: 0, reviews: 0, skipped: 3 });
    expect(r.flags).toEqual([FLAGS.lowConfidence, FLAGS.unchecked]);
  });
});

describe("auditSummary and csv", () => {
  const rows = [
    auditRow({ name: "A" }, match(), { indexed: 4, guidelines: 1, trials: 0, meta: 0, reviews: 0 }),
    auditRow({ name: "B" }, match(), { indexed: 4, guidelines: 0, trials: 0, meta: 0, reviews: 0 }),
    auditRow({ name: "C" }, null),
  ];
  it("counts each group", () => {
    expect(auditSummary(rows)).toEqual({ total: 3, noEvidence: 1, noMatch: 1, lowConfidence: 0, withEvidence: 1 });
  });
  it("names columns with the window year and joins flags", () => {
    const out = auditCsvRows(rows, 2021);
    expect(out[0]).toHaveProperty("pubmed_guidelines_since_2021", 1);
    expect(out[1].flags).toBe(FLAGS.noEvidence);
    expect(out[2].flags).toBe(FLAGS.noMatch);
  });
});
