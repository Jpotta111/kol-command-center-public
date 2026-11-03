import { test, expect } from "@playwright/test";
import fs from "node:fs";

// Fully mocked: no real OpenAlex or PubMed traffic, so the test is fast and stable.
// Cast: three starting researchers (A1-A3) and three collaborators (C1-C3).
//   C1 works with all three, C2 with A1 and A2 (both "shared"), C3 only with A1 ("other").
// PubMed publication types per paper:
//   W1 guideline, W2 randomized trial, W3 review, W4 meta-analysis.
const NAMES = {
  A1: "Ann Alpha", A2: "Bob Beta", A3: "Cara Gamma",
  C1: "Dana Delta", C2: "Evan Epsilon", C3: "Fay Zeta",
};
const WORKS = {
  W1: { authors: ["A1", "A2", "C1", "C2"], pmid: 1001 },
  W2: { authors: ["A1", "A3", "C1"], pmid: 1002 },
  W3: { authors: ["A2", "A3", "C1"], pmid: 1003 },
  W4: { authors: ["A1", "C3"], pmid: 1004 },
};
const PUBTYPES = {
  1001: ["Journal Article", "Practice Guideline"],
  1002: ["Journal Article", "Randomized Controlled Trial"],
  1003: ["Journal Article", "Review"],
  1004: ["Journal Article", "Meta-Analysis", "Systematic Review"],
};
const ORCIDS = { "0000-0001-0000-0001": "A1", "0000-0001-0000-0002": "A2", "0000-0001-0000-0003": "A3" };
const CSV = "name,institution,orcid\n" + Object.entries(ORCIDS).map(([o, a]) => `${NAMES[a]},Test University,${o}`).join("\n") + "\n";

const oa = (id) => `https://openalex.org/${id}`;
const author = (id) => ({
  id: oa(id),
  display_name: NAMES[id],
  orcid: null,
  works_count: 40,
  cited_by_count: 1000,
  summary_stats: { h_index: 20 },
  last_known_institutions: [{ display_name: "Test University", country_code: "US" }],
  topics: [{ display_name: "Heart failure" }],
});
const work = (wid) => ({
  id: oa(wid),
  doi: `https://doi.org/10.1000/${wid.toLowerCase()}`,
  title: `Paper ${wid}`,
  publication_year: 2024,
  cited_by_count: 10,
  ids: { pmid: `https://pubmed.ncbi.nlm.nih.gov/${WORKS[wid].pmid}` },
  authorships: WORKS[wid].authors.map((a) => ({ author: { id: oa(a), display_name: NAMES[a] }, institutions: [{ display_name: "Test University" }] })),
});

async function mockNetwork(page, { pubmedStatus = 200 } = {}) {
  const outside = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (url.hostname === "api.openalex.org") {
      const json = (body) => route.fulfill({ json: body });
      if (url.pathname.startsWith("/authors/orcid:")) {
        const a = ORCIDS[url.pathname.split("orcid:")[1]];
        return a ? json(author(a)) : route.fulfill({ status: 404, json: { error: "not found" } });
      }
      if (url.pathname === "/authors") {
        const ids = (url.searchParams.get("filter") || "").replace("openalex:", "").split("|").filter(Boolean);
        return json({ results: ids.filter((i) => NAMES[i]).map(author) });
      }
      if (url.pathname === "/works") {
        const a = (url.searchParams.get("filter") || "").match(/author\.id:(\w+)/)?.[1];
        return json({ results: Object.keys(WORKS).filter((w) => WORKS[w].authors.includes(a)).map(work) });
      }
      return route.fulfill({ status: 404, json: {} });
    }
    if (url.hostname === "eutils.ncbi.nlm.nih.gov") {
      if (pubmedStatus !== 200) return route.fulfill({ status: pubmedStatus, json: {} });
      const ids = (url.searchParams.get("id") || "").split(",");
      const result = { uids: ids };
      for (const id of ids) if (PUBTYPES[id]) result[id] = { uid: id, pubtype: PUBTYPES[id] };
      return route.fulfill({ json: { result } });
    }
    outside.push(url.hostname);
    return route.abort();
  });
  return outside;
}

async function searchFromCsv(page) {
  await page.addInitScript(() => localStorage.setItem("kol_discover_lite_signed_up_v1", "1"));
  await page.goto("/");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "My list (CSV)" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "kols.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await page.getByRole("button", { name: /Map their network \(3\)/ }).click();
}

test("evidence card, list filter, person panel and CSV use PubMed data", async ({ page }) => {
  const outside = await mockNetwork(page);
  await searchFromCsv(page);

  // Takeaway card: top 5 by guidelines, then trials. Fay Zeta has neither, so she is left out.
  const card = page.locator("div", { has: page.getByText("Top guideline and trial authors", { exact: true }) }).last();
  await expect(card.getByText("From PubMed, papers since")).toBeVisible();
  await expect(card.getByText(NAMES.C1)).toBeVisible();
  await expect(card.getByText("1 guideline, 1 trial").first()).toBeVisible();
  await expect(card.getByText(NAMES.C3)).toHaveCount(0);

  // List view and the guideline/trial filter.
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Guidelines / trials" })).toBeVisible();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(6);
  await page.locator("select").selectOption({ label: "Guideline or trial authors" });
  await expect(rows).toHaveCount(5);
  await expect(page.locator("tbody")).not.toContainText(NAMES.C3);

  // Person panel shows the breakdown out of papers indexed in PubMed.
  await page.locator("tbody tr", { hasText: NAMES.C1 }).click();
  await expect(page.getByText(/Evidence they author \(PubMed, since \d{4}\)/)).toBeVisible();
  await expect(page.getByText("Out of 3 papers indexed in PubMed.")).toBeVisible();

  // CSV export carries the six PubMed columns with the right numbers.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  const csv = fs.readFileSync(await download.path(), "utf8");
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  for (const col of ["pubmed_guidelines", "pubmed_clinical_trials", "pubmed_systematic_reviews_meta", "pubmed_reviews", "pubmed_observational", "pubmed_indexed_papers"]) {
    expect(header).toContain(col);
  }
  const cols = header.split(",");
  const dana = lines.find((l) => l.includes(NAMES.C1)).split(",");
  expect(dana[cols.indexOf("pubmed_guidelines")]).toBe("1");
  expect(dana[cols.indexOf("pubmed_clinical_trials")]).toBe("1");
  expect(dana[cols.indexOf("pubmed_indexed_papers")]).toBe("3");

  // Privacy: the only third parties contacted are OpenAlex and PubMed.
  expect(outside).toEqual([]);
});

test("tells the user when PubMed could not be reached", async ({ page }) => {
  await mockNetwork(page, { pubmedStatus: 500 });
  await searchFromCsv(page);
  await expect(page.getByText(/PubMed could not check \d+ papers/i)).toBeVisible({ timeout: 25000 });
});

test("List Audit counts evidence per person and flags people with none", async ({ page }) => {
  const outside = await mockNetwork(page);
  await page.addInitScript(() => localStorage.setItem("kol_discover_lite_signed_up_v1", "1"));
  await page.goto("/");
  await page.getByRole("button", { name: "Audit my speaker list" }).click();
  // Fay Zeta (C3) is only on the meta-analysis paper, Ann (A1) has all four. Bob has guideline + review.
  const csv = "name,institution,orcid\nAnn Alpha,Test University,0000-0001-0000-0001\nBob Beta,Test University,0000-0001-0000-0002\n";
  await page.locator('input[type="file"]').setInputFiles({ name: "list.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Audit 2 people" }).click();
  const ann = page.locator("tbody tr", { hasText: "Ann Alpha" });
  await expect(ann).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/of 2 have no guideline, trial or review evidence found/)).toBeVisible();
  // Ann: 1 guideline, 1 trial. Bob: guideline W1, review W3.
  await expect(ann.locator("td").nth(2)).toHaveText("1");
  await expect(ann.locator("td").nth(3)).toHaveText("1");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export audit CSV" }).click()]);
  const out = fs.readFileSync(await download.path(), "utf8");
  expect(out.split(/\r?\n/)[0]).toContain("pubmed_guidelines_since_");
  expect(outside).toEqual([]);
});

test("List Audit flags a person who is not in OpenAlex", async ({ page }) => {
  await mockNetwork(page);
  await page.addInitScript(() => localStorage.setItem("kol_discover_lite_signed_up_v1", "1"));
  await page.goto("/");
  await page.getByRole("button", { name: "Audit my speaker list" }).click();
  const csv = "name,institution,orcid\nGhost Person,Nowhere,0000-0009-9999-9999\n";
  await page.locator('input[type="file"]').setInputFiles({ name: "list.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Audit 1 person" }).click();
  await expect(page.getByText("Could not find this person in OpenAlex")).toBeVisible({ timeout: 20000 });
});

test("pricing page shows the three plans and the founding partner call to action", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Founding partner", exact: true })).toBeVisible();
  await expect(page.getByText("$3,500", { exact: true })).toBeVisible();
  await expect(page.getByText("$2,500")).toBeVisible();
  await expect(page.getByText("$5,000")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a founding partnership" })).toBeVisible();
  // No Stripe link is configured yet, so no card button.
  await expect(page.getByRole("link", { name: "Pay by card" })).toHaveCount(0);
});
