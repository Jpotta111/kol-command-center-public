import { useEffect, useState } from "react";
import { CATEGORY } from "./NetworkGraph";
import { summarizePerson } from "../lib/gemini";

function doiUrl(doi) {
  if (!doi) return "";
  return doi.startsWith("http") ? doi : `https://doi.org/${doi}`;
}

export default function PersonPanel({ person, seedNames, geminiKey, onClose, onOpenKeys, onSelect }) {
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setBrief("");
    setError("");
  }, [person?.id]);

  if (!person) return null;
  const cat = CATEGORY[person.category];

  async function makeBrief() {
    setLoading(true);
    setError("");
    try {
      setBrief(await summarizePerson(geminiKey, person, seedNames));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="w-full lg:w-96 bg-white border-l border-gray-200 overflow-y-auto">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span
              className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded"
              style={{ background: `${cat.color}22`, color: cat.color }}
            >
              {person.isSeed ? "Starting researcher" : person.category === "shared" ? "Shared collaborator" : "Collaborator"}
            </span>
            <h3 className="mt-2 text-lg font-bold text-ink leading-snug">{person.display_name}</h3>
            <p className="text-sm text-gray-600">{person.institution || "Institution unknown"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none" aria-label="Close">
            &times;
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["h-index", person.h_index],
            ["Works", person.works_count],
            ["Citations", person.cited_by_count],
          ].map(([l, v]) => (
            <div key={l} className="bg-gray-50 rounded-lg py-2">
              <p className="text-base font-semibold text-ink">{v != null ? Number(v).toLocaleString() : "-"}</p>
              <p className="text-[11px] text-gray-500">{l}</p>
            </div>
          ))}
        </div>

        {person.topics?.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-500">Main topics</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {person.topics.map((t) => (
                <span key={t} className="text-xs bg-gray-100 rounded px-2 py-0.5">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {!person.isSeed && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-500">
              Connected to {person.seedsConnected.length} of your starting researchers
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {person.seedsConnected.map((id) => (
                <button
                  key={id}
                  onClick={() => onSelect(id)}
                  className="text-xs border border-brand/40 text-brand rounded px-2 py-0.5 hover:bg-brand-soft"
                >
                  {seedNames.get(id)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500">
            {person.isSeed
              ? `Papers with your other starting researchers (${person.jointPapers.length})`
              : `Joint papers (${person.jointPapers.length})`}
          </p>
          {person.jointPapers.length === 0 && (
            <p className="mt-1 text-sm text-gray-500">None in the selected time window.</p>
          )}
          <ul className="mt-1 space-y-2">
            {person.jointPapers.slice(0, 8).map((w) => (
              <li key={w.id} className="text-sm leading-snug">
                {w.doi ? (
                  <a className="text-ink hover:text-brand underline decoration-gray-300" href={doiUrl(w.doi)} target="_blank" rel="noreferrer">
                    {w.title}
                  </a>
                ) : (
                  <span className="text-ink">{w.title}</span>
                )}
                <span className="text-xs text-gray-500"> · {w.year || "n.d."} · {w.cited_by_count} cites</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500">AI brief</p>
          {brief ? (
            <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{brief}</div>
          ) : geminiKey ? (
            <button
              onClick={makeBrief}
              disabled={loading}
              className="mt-2 w-full bg-brand text-white text-sm font-medium rounded-lg py-2 hover:bg-brand-dark disabled:opacity-50"
            >
              {loading ? "Writing brief..." : "Write a brief on this person"}
            </button>
          ) : (
            <p className="mt-1 text-sm text-gray-500">
              Add a free Google AI Studio key on the{" "}
              <button onClick={onOpenKeys} className="text-brand underline">
                Keys
              </button>{" "}
              step to get a short brief and conversation starters.
            </p>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {brief && <p className="mt-2 text-[11px] text-gray-400">AI-generated from public publication data. Verify before use.</p>}
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-xs">
          <a className="text-brand underline" href={`https://openalex.org/${person.id}`} target="_blank" rel="noreferrer">
            OpenAlex profile
          </a>
          {person.orcid && (
            <a className="text-brand underline" href={person.orcid} target="_blank" rel="noreferrer">
              ORCID
            </a>
          )}
          <a
            className="text-brand underline"
            href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(person.display_name)}%5BAuthor%5D`}
            target="_blank"
            rel="noreferrer"
          >
            Search PubMed
          </a>
        </div>
      </div>
    </aside>
  );
}
