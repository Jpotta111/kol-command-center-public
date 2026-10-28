import { useState } from "react";
import { findPapers, topicAuthors, matchAuthor, shortId } from "../lib/openalex";
import { parsePeopleCsv, CSV_TEMPLATE, downloadText } from "../lib/csv";

const MODES = [
  { id: "paper", label: "A publication", hint: "Paste a DOI or a paper title. We start from its authors." },
  { id: "topic", label: "A research topic", hint: "We find the most active authors on recent, well-cited papers." },
  { id: "csv", label: "My list (CSV)", hint: "Upload the KOLs you already work with. We find who they have in common." },
];

const YEAR_OPTIONS = [3, 5, 10];

function optionFromAuthorship(a) {
  return {
    id: shortId(a.author?.id),
    display_name: a.author?.display_name || "Unknown",
    institution: a.institutions?.[0]?.display_name || "",
  };
}

function optionFromAuthor(a) {
  return {
    id: shortId(a.id),
    display_name: a.display_name,
    institution: a.last_known_institutions?.[0]?.display_name || "",
    works_count: a.works_count,
    h_index: a.summary_stats?.h_index,
  };
}

export default function StartStep({ client, years, setYears, onSeedsReady }) {
  const [mode, setMode] = useState("paper");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [paperChoices, setPaperChoices] = useState(null);
  const [warnings, setWarnings] = useState([]);

  const fromYear = new Date().getFullYear() - years;

  function useWork(w, label) {
    const auths = (w.authorships || []).filter((a) => a.author?.id);
    if (!auths.length) {
      setError("That paper has no linked authors in OpenAlex. Try another.");
      return;
    }
    const rows = auths.slice(0, 25).map((a, i) => ({
      key: `${shortId(a.author.id)}-${i}`,
      input: null,
      options: [optionFromAuthorship(a)],
      selected: 0,
      include: true,
    }));
    onSeedsReady(rows, { label, kind: "paper" });
  }

  async function runPaper() {
    setBusy("Looking up the paper");
    const works = await findPapers(client, text);
    if (!works.length) throw new Error("No matching paper found. Try the DOI.");
    if (works.length === 1) useWork(works[0], works[0].title);
    else setPaperChoices(works);
  }

  async function runTopic() {
    const authors = await topicAuthors(client, text.trim(), { fromYear, pages: 2, onProgress: setBusy });
    if (!authors.length) throw new Error("No papers found for that topic. Try broader words.");
    const rows = authors.slice(0, 30).map((a, i) => ({
      key: a.id,
      input: null,
      note: `${a.papers} top papers on this topic`,
      options: [{ id: a.id, display_name: a.display_name, institution: a.institution }],
      selected: 0,
      include: i < 12,
    }));
    onSeedsReady(rows, { label: text.trim(), kind: "topic" });
  }

  async function runCsv(file) {
    setBusy("Reading your file");
    const { people, warnings: w } = await parsePeopleCsv(file);
    setWarnings(w);
    if (!people.length) throw new Error("The file has no usable rows.");
    const rows = [];
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      setBusy(`Matching ${i + 1} of ${people.length}: ${p.name || p.orcid || p.openalexId}`);
      let matches = [];
      try {
        matches = await matchAuthor(client, p);
      } catch (e) {
        if (e.status === 401 || e.status === 403 || e.status === 429) throw e;
      }
      rows.push({
        key: `row-${i}`,
        input: [p.name, p.institution].filter(Boolean).join(", ") || p.orcid || p.openalexId,
        confidence: matches[0]?.confidence || "none",
        options: matches.map((m) => optionFromAuthor(m.author)),
        selected: 0,
        include: matches.length > 0,
      });
    }
    onSeedsReady(rows, { label: file.name, kind: "csv" });
  }

  async function go(fn) {
    setError("");
    setPaperChoices(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy("");
    }
  }

  const current = MODES.find((m) => m.id === mode);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <h2 className="text-2xl font-bold text-ink">Where do you want to start?</h2>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              setMode(m.id);
              setError("");
              setPaperChoices(null);
              setText("");
            }}
            className={`text-left rounded-xl border px-4 py-3 transition-colors ${
              mode === m.id ? "border-brand bg-brand-soft" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <p className="font-semibold text-sm text-ink">{m.label}</p>
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-gray-600">{current.hint}</p>

      <div className="mt-5 bg-white border border-gray-200 rounded-xl p-5">
        {mode !== "csv" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) go(mode === "paper" ? runPaper : runTopic);
            }}
          >
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder={
                mode === "paper"
                  ? "Paste a DOI (starts with 10.) or a paper title"
                  : "e.g. heart failure with preserved ejection fraction"
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="submit"
              disabled={!text.trim() || !!busy}
              className="mt-3 bg-brand text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-dark disabled:opacity-40"
            >
              {mode === "paper" ? "Find paper" : "Find authors"}
            </button>
          </form>
        ) : (
          <div>
            <p className="text-sm text-gray-600">
              One person per row. Needs a <code className="bg-gray-100 px-1 rounded">name</code> column.
              Optional: <code className="bg-gray-100 px-1 rounded">institution</code> (improves matching),{" "}
              <code className="bg-gray-100 px-1 rounded">orcid</code> (exact match). Up to 25 people.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="bg-brand text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-dark cursor-pointer">
                Upload CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) go(() => runCsv(f));
                  }}
                />
              </label>
              <button
                onClick={() => downloadText(CSV_TEMPLATE, "kol_list_template.csv")}
                className="text-sm text-brand underline"
              >
                Download template
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-400">The file is read in your browser and never uploaded anywhere.</p>
          </div>
        )}

        <div className="mt-5 flex items-center gap-2 text-sm text-gray-600">
          <span>Look at papers from the last</span>
          <select
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y} years
              </option>
            ))}
          </select>
        </div>
      </div>

      {busy && (
        <p className="mt-4 text-sm text-brand flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          {busy}
        </p>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {warnings.map((w) => (
        <p key={w} className="mt-2 text-sm text-amber-700">
          {w}
        </p>
      ))}

      {paperChoices && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-ink">Which paper did you mean?</p>
          <ul className="mt-2 space-y-2">
            {paperChoices.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => useWork(w, w.title)}
                  className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-brand"
                >
                  <p className="text-sm font-medium text-ink">{w.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {w.publication_year} · {(w.authorships || []).length} authors · {w.cited_by_count} citations
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
