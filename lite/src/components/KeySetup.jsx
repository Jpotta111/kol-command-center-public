import { useState } from "react";
import { testOpenAlexKey } from "../lib/openalex";
import { testGeminiKey } from "../lib/gemini";

function Status({ result }) {
  if (!result) return null;
  return (
    <p className={`mt-2 text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>
      {result.ok ? "✓ " : ""}
      {result.message}
    </p>
  );
}

function Steps({ items }) {
  return (
    <ol className="mt-3 space-y-1.5 text-sm text-gray-600 list-decimal list-inside">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

export default function KeySetup({ keys, onChange, onContinue }) {
  const [showOaHelp, setShowOaHelp] = useState(!keys.openalexKey);
  const [showGemHelp, setShowGemHelp] = useState(false);
  const [oaResult, setOaResult] = useState(null);
  const [gemResult, setGemResult] = useState(null);
  const [testing, setTesting] = useState("");

  const set = (patch) => onChange({ ...keys, ...patch });

  async function testOa() {
    setTesting("oa");
    setOaResult(await testOpenAlexKey(keys.openalexKey.trim()));
    setTesting("");
  }
  async function testGem() {
    setTesting("gem");
    setGemResult(await testGeminiKey(keys.geminiKey.trim()));
    setTesting("");
  }

  const input =
    "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <h2 className="text-2xl font-bold text-ink">Add your keys</h2>
      <p className="mt-2 text-gray-600">
        Keys connect this tool to free research and AI services using <em>your</em> account. They stay in this
        browser. They are never sent to us.
      </p>

      {/* OpenAlex */}
      <section className="mt-8 bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-ink">
              OpenAlex key <span className="text-xs font-normal text-brand ml-1">recommended, free</span>
            </p>
            <p className="text-sm text-gray-600 mt-1">
              OpenAlex is the research database we search. You can try a small search without a key, but a free
              key gives you more results and your own daily allowance.
            </p>
          </div>
        </div>
        <button onClick={() => setShowOaHelp(!showOaHelp)} className="mt-3 text-sm text-brand underline">
          {showOaHelp ? "Hide" : "Show"} how to get a free OpenAlex key
        </button>
        {showOaHelp && (
          <Steps
            items={[
              <>
                Open{" "}
                <a className="underline text-brand" href="https://openalex.org" target="_blank" rel="noreferrer">
                  openalex.org
                </a>{" "}
                and click <b>Sign up</b> (free). Use any email.
              </>,
              <>Once signed in, open your account settings (your name or avatar in the top right).</>,
              <>
                Find the <b>API key</b> section and create a key. Copy it.
              </>,
              <>Paste it below and press Test.</>,
            ]}
          />
        )}
        <div className="mt-4 flex gap-2">
          <input
            className={input}
            type="password"
            autoComplete="off"
            placeholder="Paste your OpenAlex key"
            value={keys.openalexKey}
            onChange={(e) => {
              set({ openalexKey: e.target.value });
              setOaResult(null);
            }}
          />
          <button
            onClick={testOa}
            disabled={!keys.openalexKey || testing === "oa"}
            className="px-4 rounded-lg border border-brand text-brand text-sm font-medium hover:bg-brand-soft disabled:opacity-40"
          >
            {testing === "oa" ? "Testing" : "Test"}
          </button>
        </div>
        <Status result={oaResult} />
        <label className="block mt-4 text-sm text-gray-600">
          Email (optional, lets OpenAlex contact you about your usage)
          <input
            className={`${input} mt-1 font-sans`}
            type="email"
            placeholder="you@example.com"
            value={keys.email}
            onChange={(e) => set({ email: e.target.value })}
          />
        </label>
      </section>

      {/* Gemini */}
      <section className="mt-5 bg-white border border-gray-200 rounded-xl p-5">
        <p className="font-semibold text-ink">
          Google AI Studio key <span className="text-xs font-normal text-gray-500 ml-1">optional, free tier</span>
        </p>
        <p className="text-sm text-gray-600 mt-1">
          Only needed for the AI brief on each person. Everything else works without it.
        </p>
        <button onClick={() => setShowGemHelp(!showGemHelp)} className="mt-3 text-sm text-brand underline">
          {showGemHelp ? "Hide" : "Show"} how to get a free Google AI Studio key
        </button>
        {showGemHelp && (
          <Steps
            items={[
              <>
                Open{" "}
                <a
                  className="underline text-brand"
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                >
                  aistudio.google.com/apikey
                </a>{" "}
                and sign in with a Google account.
              </>,
              <>
                Click <b>Create API key</b> and copy it.
              </>,
              <>Paste it below and press Test.</>,
              <>
                Tip: the free tier is enough for this tool. Google may use free-tier prompts to improve its
                products, and the prompts here contain only public publication data.
              </>,
            ]}
          />
        )}
        <div className="mt-4 flex gap-2">
          <input
            className={input}
            type="password"
            autoComplete="off"
            placeholder="Paste your Google AI Studio key"
            value={keys.geminiKey}
            onChange={(e) => {
              set({ geminiKey: e.target.value });
              setGemResult(null);
            }}
          />
          <button
            onClick={testGem}
            disabled={!keys.geminiKey || testing === "gem"}
            className="px-4 rounded-lg border border-brand text-brand text-sm font-medium hover:bg-brand-soft disabled:opacity-40"
          >
            {testing === "gem" ? "Testing" : "Test"}
          </button>
        </div>
        <Status result={gemResult} />
      </section>

      <label className="mt-5 flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={keys.remember} onChange={(e) => set({ remember: e.target.checked })} />
        Remember my keys on this device (skip on shared computers)
      </label>

      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={onContinue}
          className="bg-brand text-white font-semibold px-6 py-3 rounded-lg hover:bg-brand-dark transition-colors"
        >
          Continue
        </button>
        {!keys.openalexKey && (
          <span className="text-sm text-gray-500">No key? You can still try a small search.</span>
        )}
      </div>
    </div>
  );
}
