import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { classify, evidenceLeaders, evidenceProfiles } from "../../src/lib/pubmed";

const pmUrl = (n) => `https://pubmed.ncbi.nlm.nih.gov/${n}`;

describe("classify", () => {
  it("flags guidelines from any of the three PubMed types", () => {
    expect(classify(["Practice Guideline"]).guidelines).toBe(true);
    expect(classify(["Guideline"]).guidelines).toBe(true);
    expect(classify(["Consensus Development Conference"]).guidelines).toBe(true);
  });

  it("flags trials, including phase-labelled and randomized ones", () => {
    expect(classify(["Randomized Controlled Trial"]).trials).toBe(true);
    expect(classify(["Clinical Trial, Phase III"]).trials).toBe(true);
    expect(classify(["Journal Article"]).trials).toBe(false);
  });

  it("does not count systematic reviews or meta-analyses as plain reviews", () => {
    const sr = classify(["Review", "Systematic Review"]);
    expect(sr.meta).toBe(true);
    expect(sr.reviews).toBe(false);
    const ma = classify(["Review", "Meta-Analysis"]);
    expect(ma.meta).toBe(true);
    expect(ma.reviews).toBe(false);
    expect(classify(["Review"]).reviews).toBe(true);
  });

  it("does not count trial protocols as trials", () => {
    expect(classify(["Clinical Trial Protocol"]).trials).toBe(false);
    expect(classify(["Clinical Trial Protocol", "Randomized Controlled Trial"]).trials).toBe(true);
  });

  it("flags observational studies and handles empty input", () => {
    expect(classify(["Observational Study"]).observational).toBe(true);
    expect(Object.values(classify(undefined)).every((v) => v === false)).toBe(true);
  });
});

describe("evidenceLeaders", () => {
  const people = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const stats = new Map([
    ["a", { guidelines: 1, trials: 5 }],
    ["b", { guidelines: 3, trials: 0 }],
    ["c", { guidelines: 0, trials: 0 }],
    ["d", { guidelines: 1, trials: 9 }],
  ]);

  it("sorts by guidelines, then trials, and drops people with neither", () => {
    expect(evidenceLeaders(people, stats).map(({ p }) => p.id)).toEqual(["b", "d", "a"]);
  });

  it("respects the limit and ignores people with no stats", () => {
    expect(evidenceLeaders([...people, { id: "zzz" }], stats, 2).map(({ p }) => p.id)).toEqual(["b", "d"]);
  });
});

describe("evidenceProfiles", () => {
  // People: p1 has PMIDs 1,2,3. p2 has PMIDs 3,4. p3 has none.
  const worksByAuthor = {
    p1: [1, 2, 3],
    p2: [3, 4],
    p3: [],
  };
  const pubtypes = {
    1: ["Practice Guideline"],
    2: ["Randomized Controlled Trial"],
    3: ["Review"],
    4: ["Meta-Analysis"],
  };

  function makeClient(map = worksByAuthor) {
    return {
      get: vi.fn(async (_path, params) => {
        const id = String(params.filter).match(/author\.id:([^,]+)/)[1];
        const all = map[id] || [];
        const page = Number(params.page || 1);
        const slice = all.slice((page - 1) * 100, page * 100);
        return { results: slice.map((n) => ({ id: `https://openalex.org/W${n}`, ids: { pmid: pmUrl(n) } })) };
      }),
    };
  }

  function stubPubMed(handler) {
    const fetchMock = vi.fn(async (url) => handler(new URL(url)));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const ok = (url, types = pubtypes) => {
    const ids = url.searchParams.get("id").split(",");
    const result = { uids: ids };
    for (const id of ids) if (types[id]) result[id] = { uid: id, pubtype: types[id] };
    return { ok: true, status: 200, json: async () => ({ result }) };
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function run(promise) {
    await vi.runAllTimersAsync();
    return promise;
  }

  const people = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];

  it("counts evidence per person and shares one PubMed call across people", async () => {
    const fetchMock = stubPubMed((u) => ok(u));
    const stats = await run(evidenceProfiles(makeClient(), people, { fromYear: 2021 }));

    expect(stats.get("p1")).toEqual({ indexed: 3, guidelines: 1, trials: 1, meta: 0, reviews: 1, observational: 0 });
    expect(stats.get("p2")).toEqual({ indexed: 2, guidelines: 0, trials: 0, meta: 1, reviews: 1, observational: 0 });
    expect(stats.get("p3").indexed).toBe(0);
    // PMID 3 is shared by p1 and p2 and is only requested once.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const ids = new URL(fetchMock.mock.calls[0][0]).searchParams.get("id").split(",");
    expect(ids.sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("asks OpenAlex for each person's papers since the window start", async () => {
    stubPubMed((u) => ok(u));
    const client = makeClient();
    await run(evidenceProfiles(client, people, { fromYear: 2021 }));
    expect(client.get).toHaveBeenCalledWith(
      "/works",
      expect.objectContaining({ filter: "author.id:p1,from_publication_date:2021-01-01", select: "id,ids" })
    );
  });

  it("splits more than 180 PMIDs into batches", async () => {
    const many = Array.from({ length: 200 }, (_, i) => i + 1);
    const types = Object.fromEntries(many.map((n) => [n, ["Journal Article"]]));
    const fetchMock = stubPubMed((u) => ok(u, types));
    const stats = await run(evidenceProfiles(makeClient({ p1: many }), [{ id: "p1" }], { fromYear: 2021 }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stats.get("p1").indexed).toBe(200);
  });

  it("retries after a 429 and still returns the counts", async () => {
    let calls = 0;
    const fetchMock = stubPubMed((u) => {
      calls += 1;
      return calls === 1 ? { ok: false, status: 429, json: async () => ({}) } : ok(u);
    });
    const stats = await run(evidenceProfiles(makeClient(), people, { fromYear: 2021 }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stats.get("p1").guidelines).toBe(1);
  });

  it("reports progress up to 100 percent", async () => {
    stubPubMed((u) => ok(u));
    const calls = [];
    await run(evidenceProfiles(makeClient(), people, { fromYear: 2021, onProgress: (d, t) => calls.push([d, t]) }));
    expect(calls.at(-1)).toEqual([people.length * 2, people.length * 2]);
  });

  it("moves progress during the PubMed step instead of sitting at 50%", async () => {
    const many = Array.from({ length: 400 }, (_, i) => i + 1);
    const types = Object.fromEntries(many.map((n) => [n, ["Journal Article"]]));
    const fetchMock = stubPubMed((u) => ok(u, types));
    const map = { p1: many.slice(0, 200), p2: many.slice(200) };
    const calls = [];
    const fetchesAt = [];
    await run(
      evidenceProfiles(makeClient(map), [{ id: "p1" }, { id: "p2" }], {
        fromYear: 2021,
        onProgress: (d, t) => {
          calls.push(d / t);
          fetchesAt.push(fetchMock.mock.calls.length);
        },
      })
    );
    // 400 PMIDs = 3 PubMed batches. Progress must pass 50% while batches are still pending,
    // not only after the last one returns.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstPast50 = calls.findIndex((x) => x > 0.5);
    expect(fetchesAt[firstPast50]).toBeLessThan(3);
    // Progress never goes backwards and ends at 100%.
    expect(calls.every((x, i) => i === 0 || x >= calls[i - 1])).toBe(true);
    expect(calls.at(-1)).toBe(1);
  });

  it("rejects when OpenAlex fails, so the app can show a stopped message", async () => {
    stubPubMed((u) => ok(u));
    const client = { get: vi.fn(async () => { throw new Error("OpenAlex down"); }) };
    const p = evidenceProfiles(client, people, { fromYear: 2021 });
    const settled = p.then(() => "resolved", (e) => e.message);
    await vi.runAllTimersAsync();
    expect(await settled).toBe("OpenAlex down");
  });

  it("stops the other workers and sends no progress after one OpenAlex call fails", async () => {
    stubPubMed((u) => ok(u));
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}` }));
    const client = {
      get: vi.fn(async (_path, params) => {
        const id = String(params.filter).match(/author\.id:([^,]+)/)[1];
        if (id === "x1") throw new Error("OpenAlex 500");
        await new Promise((r) => setTimeout(r, 50));
        return { results: [] };
      }),
    };
    const progress = [];
    let errorAt = null;
    const p = evidenceProfiles(client, many, { fromYear: 2021, onProgress: (d) => progress.push(d) }).catch((e) => {
      errorAt = progress.length;
      return e.message;
    });
    await vi.runAllTimersAsync();
    expect(await p).toBe("OpenAlex 500");
    // Workers already mid-request may finish, but none report progress after the failure.
    expect(progress.length).toBe(errorAt);
    // The remaining people were never requested.
    expect(client.get.mock.calls.length).toBeLessThan(many.length);
  });

  it("retries a passing PubMed server error instead of dropping the batch", async () => {
    let calls = 0;
    stubPubMed((u) => {
      calls += 1;
      return calls === 1 ? { ok: false, status: 503, json: async () => ({}) } : ok(u);
    });
    const stats = await run(evidenceProfiles(makeClient(), people, { fromYear: 2021 }));
    expect(stats.get("p1").guidelines).toBe(1);
  });

  it("does not count IDs PubMed has no record for as indexed", async () => {
    stubPubMed((u) => {
      const ids = u.searchParams.get("id").split(",");
      const result = { uids: ids };
      for (const id of ids) result[id] = id === "4" ? { uid: id, error: "cannot get document summary" } : { uid: id, pubtype: pubtypes[id] };
      return { ok: true, status: 200, json: async () => ({ result }) };
    });
    const stats = await run(evidenceProfiles(makeClient(), people, { fromYear: 2021 }));
    expect(stats.get("p2").indexed).toBe(1);
  });

  it("reports papers that PubMed could not classify", async () => {
    stubPubMed(() => ({ ok: false, status: 429, json: async () => ({}) }));
    const stats = await run(evidenceProfiles(makeClient(), people, { fromYear: 2021 }));
    expect(stats.get("p1").skipped).toBe(3);
    expect(stats.skippedPapers).toBe(4);
  });

  it("treats a 200 response with an error body as a failed batch", async () => {
    stubPubMed(() => ({ ok: true, status: 200, json: async () => ({ error: "rate limited" }) }));
    const stats = await run(evidenceProfiles(makeClient(), people, { fromYear: 2021 }));
    expect(stats.skippedPapers).toBe(4);
  });

  it("does not report skipped papers when PubMed answers", async () => {
    stubPubMed((u) => ok(u));
    const stats = await run(evidenceProfiles(makeClient(), people, { fromYear: 2021 }));
    expect(stats.skippedPapers).toBe(0);
    expect(stats.get("p1").skipped).toBeUndefined();
  });

  it("flags people whose papers hit the 200 paper cap", async () => {
    const many = Array.from({ length: 250 }, (_, i) => i + 1);
    const types = Object.fromEntries(many.map((n) => [n, ["Journal Article"]]));
    stubPubMed((u) => ok(u, types));
    const stats = await run(evidenceProfiles(makeClient({ p1: many, p2: [1] }), [{ id: "p1" }, { id: "p2" }], { fromYear: 2021 }));
    expect(stats.get("p1").capped).toBe(true);
    expect(stats.get("p2").capped).toBeUndefined();
    expect(stats.cappedPeople).toBe(1);
  });
});
