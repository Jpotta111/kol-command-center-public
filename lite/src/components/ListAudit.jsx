import { useState } from "react";
import { parsePeopleCsv, CSV_TEMPLATE, downloadText, rowsToCsv } from "../lib/csv";
import { runAudit, auditSummary, auditCsvRows, FLAGS } from "../lib/audit";
import { SIGNUP_URL } from "../config";

const YEARS = 5;

export default function ListAudit({ client, guard, onRunDone, onBack }) {
  const [state, setState] = useState("idle"); // idle | running | done
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [people, setPeople] = useState(null);
  const [result, setResult] = useState(null);
  const fromYear = new Date().getFullYear() - YEARS;

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);
    try {
      const parsed = await parsePeopleCsv(file);
      setPeople(parsed.people);
      setWarnings(parsed.warnings);
    } catch (err) {
      setPeople(null);
      setError(err.message || String(err));
    }
  }

  async function start() {
    setError("");
    setState("running");
    try {
      const out = await runAudit(client, people, { fromYear, onProgress: setProgress });
      setResult(out);
      setState("done");
      onRunDone?.();
    } catch (err) {
      setError(err.message || String(err));
      setState("idle");
    } finally {
      setProgress("");
    }
  }

  function exportCsv() {
    const date = new Date().toISOString().slice(0, 10);
    downloadText(rowsToCsv(auditCsvRows(result.rows, fromYear)), `list_audit_${date}.csv`);
  }

  const summary = result && auditSummary(result.rows);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <button onClick={onBack} className="text-sm text-brand underline">
        Back
      </button>
      <h1 className="mt-3 text-3xl font-bold text-ink">List Audit</h1>
      <p className="mt-2 text-gray-600 max-w-2xl">
        Upload your speakers, advisors or KOL list. For each person we count the guidelines, clinical trials and
        reviews they have authored in PubMed since {fromYear}, and flag anyone with none. Public data only. Your file
        stays in your browser.
      </p>

      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
        <label className="block text-sm font-medium text-ink">
          CSV file (columns: name, institution, orcid)
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="mt-2 block text-sm" />
        </label>
        <button
          onClick={() => downloadText(CSV_TEMPLATE, "list_audit_template.csv")}
          className="mt-2 text-xs text-brand underline"
        >
          Download a template
        </button>
        {warnings.map((w) => (
          <p key={w} className="mt-2 text-sm text-amber-700">
            {w}
          </p>
        ))}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {people && state !== "running" && (
          <button
            onClick={() => guard("search", start)}
            className="mt-4 bg-brand text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-dark"
          >
            Audit {people.length} {people.length === 1 ? "person" : "people"}
          </button>
        )}
        {state === "running" && (
          <p className="mt-4 text-sm text-ink">
            <span className="inline-block w-4 h-4 mr-2 align-middle rounded-full border-2 border-brand border-t-transparent animate-spin" />
            {progress || "Working"}
          </p>
        )}
      </div>

      {result && (
        <div className="mt-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="text-sm text-ink">
              <b>{summary.noEvidence}</b> of {summary.total} have no guideline, trial or review evidence found
              {summary.noMatch > 0 && <>; <b>{summary.noMatch}</b> could not be found</>}
              {summary.lowConfidence > 0 && <>; <b>{summary.lowConfidence}</b> need a name check</>}.
            </p>
            <button
              onClick={() => guard("export", exportCsv)}
              className="ml-auto text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50"
            >
              Export audit CSV
            </button>
          </div>
          {result.note && <p className="mt-3 bg-amber-50 text-amber-800 text-sm px-3 py-2 rounded-lg">{result.note}</p>}
          <div className="mt-4 overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2 hidden md:table-cell">Matched to</th>
                  <th className="text-right px-3 py-2">Guidelines</th>
                  <th className="text-right px-3 py-2">Trials</th>
                  <th className="text-right px-3 py-2">Reviews</th>
                  <th className="text-left px-3 py-2">Flag</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 font-medium text-ink">{r.name}</td>
                    <td className="px-3 py-2 hidden md:table-cell text-gray-600">
                      {r.matchedName ? `${r.matchedName}${r.matchedInstitution ? `, ${r.matchedInstitution}` : ""}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-right">{r.guidelines}</td>
                    <td className="px-3 py-2 text-right">{r.trials}</td>
                    <td className="px-3 py-2 text-right" title="Reviews, systematic reviews and meta-analyses">
                      {r.reviews + r.meta}
                    </td>
                    <td className={`px-3 py-2 ${r.flags.includes(FLAGS.noEvidence) ? "text-amber-700" : "text-gray-600"}`}>
                      {r.flags.join("; ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Publication data can mix up people with similar names. Confirm identity before you act on a flag. Want this
            to run weekly on your whole KOL list?{" "}
            <a className="text-brand underline" href="/pricing">
              See pricing
            </a>{" "}
            or{" "}
            <a className="text-brand underline" href={SIGNUP_URL} target="_blank" rel="noreferrer">
              get early access
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
