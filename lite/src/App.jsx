import { useCallback, useMemo, useState } from "react";
import Welcome from "./components/Welcome";
import KeySetup from "./components/KeySetup";
import StartStep from "./components/StartStep";
import ConfirmSeeds from "./components/ConfirmSeeds";
import NetworkGraph from "./components/NetworkGraph";
import PeopleTable from "./components/PeopleTable";
import PersonPanel from "./components/PersonPanel";
import { createClient, recentWorks, authorsByIds } from "./lib/openalex";
import { buildNetwork, enrichPeople, rankPeople, toCsvRows } from "./lib/network";
import { loadSavedKeys, persistKeys } from "./lib/storage";
import { downloadText, rowsToCsv } from "./lib/csv";

const STEPS = [
  ["keys", "Keys"],
  ["start", "Start"],
  ["confirm", "Confirm"],
  ["results", "Results"],
];

const REPO_URL = "https://github.com/Jpotta111/kol-command-center-public";

export default function App() {
  const [step, setStep] = useState("welcome");
  const [keys, setKeys] = useState(loadSavedKeys);
  const [years, setYears] = useState(5);
  const [cost, setCost] = useState(0);
  const [seedRows, setSeedRows] = useState([]);
  const [source, setSource] = useState(null);
  const [progress, setProgress] = useState("");
  const [runError, setRunError] = useState("");
  const [result, setResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("graph");

  const client = useMemo(
    () =>
      createClient({
        apiKey: keys.openalexKey.trim(),
        email: keys.email.trim(),
        onCost: (_total, delta) => setCost((c) => c + delta),
      }),
    [keys.openalexKey, keys.email]
  );

  const seedNames = useMemo(
    () => new Map((result?.people || []).filter((p) => p.isSeed).map((p) => [p.id, p.display_name])),
    [result]
  );

  const onSelect = useCallback((id) => setSelectedId(id), []);

  function saveKeys(next) {
    setKeys(next);
    persistKeys(next);
  }

  async function runNetwork() {
    setRunError("");
    setStep("running");
    setSelectedId(null);
    const fromYear = new Date().getFullYear() - years;
    const seeds = seedRows
      .filter((r) => r.include && r.options.length)
      .map((r) => r.options[r.selected]);
    const uniqueSeeds = [...new Map(seeds.map((s) => [s.id, s])).values()];
    try {
      const worksBySeed = new Map();
      for (let i = 0; i < uniqueSeeds.length; i++) {
        const s = uniqueSeeds[i];
        setProgress(`Reading papers for ${s.display_name} (${i + 1} of ${uniqueSeeds.length})`);
        worksBySeed.set(s.id, await recentWorks(client, s.id, { fromYear, maxWorks: 200 }));
      }
      setProgress("Finding shared collaborators");
      const { people, edges } = buildNetwork(uniqueSeeds, worksBySeed);
      setProgress(`Looking up profiles for ${people.length} people`);
      const records = await authorsByIds(
        client,
        people.map((p) => p.id)
      );
      const enriched = rankPeople(enrichPeople(people, records));
      setResult({ people: enriched, edges, fromYear, source });
      setStep("results");
    } catch (e) {
      setRunError(e.message || String(e));
      setStep("confirm");
    } finally {
      setProgress("");
    }
  }

  function exportCsv() {
    const rows = toCsvRows(result.people, seedNames);
    const date = new Date().toISOString().slice(0, 10);
    downloadText(rowsToCsv(rows), `kol_network_${date}.csv`);
  }

  // Big networks become unreadable, so the graph shows the starting researchers plus the
  // top-ranked collaborators. The list and the CSV export include every person kept by buildNetwork.
  const GRAPH_LIMIT = 120;
  const graphData = useMemo(() => {
    if (!result) return null;
    const seedsOnly = result.people.filter((p) => p.isSeed);
    const top = result.people.filter((p) => !p.isSeed).slice(0, GRAPH_LIMIT);
    const people = [...seedsOnly, ...top];
    const ids = new Set(people.map((p) => p.id));
    const edges = result.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    return { people, edges, hidden: result.people.length - people.length };
  }, [result]);

  const selected = result?.people.find((p) => p.id === selectedId) || null;
  const stats = result && {
    seeds: result.people.filter((p) => p.isSeed).length,
    shared: result.people.filter((p) => p.category === "shared").length,
    others: result.people.filter((p) => p.category === "other").length,
  };
  const stepIndex = STEPS.findIndex(([id]) => id === (step === "running" ? "confirm" : step));

  return (
    <div className="h-full flex flex-col">
      <header className="bg-white border-b border-gray-200 shrink-0">
        <div className="px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => setStep("welcome")}
            disabled={step === "running"}
            className="font-bold text-ink tracking-tight"
          >
            KOL Discover <span className="text-brand">Lite</span>
          </button>
          {step !== "welcome" && (
            <nav className="hidden sm:flex items-center gap-1 text-xs">
              {STEPS.map(([id, label], i) => (
                <span key={id} className="flex items-center gap-1">
                  {i > 0 && <span className="text-gray-300">/</span>}
                  <button
                    disabled={i > stepIndex || (id === "results" && !result) || step === "running"}
                    onClick={() => setStep(id)}
                    className={`px-2 py-1 rounded ${
                      i === stepIndex ? "bg-brand-soft text-brand font-semibold" : "text-gray-500 disabled:text-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                </span>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
            {cost > 0 && (
              <span title="OpenAlex usage cost this session, charged to your own free daily allowance">
                OpenAlex usage: ${cost.toFixed(4)}
              </span>
            )}
            {step !== "welcome" && step !== "keys" && step !== "running" && (
              <button onClick={() => setStep("keys")} className="text-brand underline">
                Keys
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        {step === "welcome" && <Welcome onStart={() => setStep("keys")} />}

        {step === "keys" && (
          <KeySetup keys={keys} onChange={saveKeys} onContinue={() => setStep(result ? "results" : "start")} />
        )}

        {step === "start" && (
          <StartStep
            client={client}
            years={years}
            setYears={setYears}
            onSeedsReady={(rows, src) => {
              setSeedRows(rows);
              setSource(src);
              setRunError("");
              setStep("confirm");
            }}
          />
        )}

        {step === "confirm" && (
          <>
            {runError && (
              <p className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 text-sm text-red-600">{runError}</p>
            )}
            <ConfirmSeeds
              rows={seedRows}
              setRows={setSeedRows}
              source={source}
              onBack={() => setStep("start")}
              onRun={runNetwork}
            />
          </>
        )}

        {step === "running" && (
          <div className="max-w-xl mx-auto px-6 py-24 text-center">
            <span className="inline-block w-8 h-8 rounded-full border-4 border-brand border-t-transparent animate-spin" />
            <p className="mt-5 text-ink font-medium">{progress || "Working"}</p>
            <p className="mt-2 text-sm text-gray-500">This usually takes under a minute.</p>
          </div>
        )}

        {step === "results" && result && (
          <div className="h-full flex flex-col">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="text-sm">
                <span className="text-gray-500">Started from </span>
                <span className="font-medium text-ink">{result.source?.label}</span>
                <span className="text-gray-500"> · papers since {result.fromYear}</span>
              </div>
              <div className="flex gap-4 text-sm">
                <span>
                  <b>{stats.seeds}</b> starting
                </span>
                <span style={{ color: "#b4651a" }}>
                  <b>{stats.shared}</b> shared collaborators
                </span>
                <span className="text-gray-500">
                  <b>{stats.others}</b> other collaborators
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                  {[
                    ["graph", "Network"],
                    ["table", "List"],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`px-3 py-1.5 ${view === v ? "bg-brand text-white" : "bg-white text-gray-700"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <button onClick={exportCsv} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50">
                  Export CSV
                </button>
                <button
                  onClick={() => {
                    setResult(null);
                    setStep("start");
                  }}
                  className="text-sm text-brand underline"
                >
                  New search
                </button>
              </div>
            </div>
            {stats.shared === 0 && (
              <p className="bg-amber-50 text-amber-800 text-sm px-4 sm:px-6 py-2 border-b border-amber-200">
                No shared collaborators found. Try more starting researchers or a longer time window.
              </p>
            )}
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
              <div className="flex-1 min-h-[420px]">
                {view === "graph" ? (
                  <div className="relative w-full h-full">
                    <NetworkGraph
                      people={graphData.people}
                      edges={graphData.edges}
                      selectedId={selectedId}
                      onSelect={onSelect}
                    />
                    {graphData.hidden > 0 && (
                      <p className="absolute top-3 left-3 bg-white/95 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600">
                        Showing the top {graphData.people.length} people. {graphData.hidden} more are in the List
                        and the CSV export.
                      </p>
                    )}
                  </div>
                ) : (
                  <PeopleTable people={result.people} seedNames={seedNames} selectedId={selectedId} onSelect={onSelect} />
                )}
              </div>
              {selected && (
                <PersonPanel
                  key={selected.id}
                  person={selected}
                  seedNames={seedNames}
                  geminiKey={keys.geminiKey.trim()}
                  onClose={() => setSelectedId(null)}
                  onOpenKeys={() => setStep("keys")}
                  onSelect={onSelect}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {step !== "results" && (
        <footer className="shrink-0 text-xs text-gray-400 px-4 sm:px-6 py-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-200 bg-white">
          <span>Data: OpenAlex (CC0). Runs entirely in your browser.</span>
          <a className="underline" href={REPO_URL} target="_blank" rel="noreferrer">
            Open source
          </a>
          <span>Built in public by Jared Potter</span>
        </footer>
      )}
    </div>
  );
}
