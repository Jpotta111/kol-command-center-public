import { SIGNUP_URL, LINKEDIN_URL } from "../config";

export default function Welcome({ onStart }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
      <p className="text-sm font-semibold tracking-wide text-brand uppercase">KOL Discover Lite</p>
      <h1 className="mt-3 text-3xl sm:text-5xl font-bold leading-tight text-ink">
        Find the researchers connected to the experts you care about.
      </h1>
      <p className="mt-5 text-lg text-gray-600 leading-relaxed">
        Start with a paper, a topic, or your own list of key opinion leaders. We map who they publish with,
        surface the collaborators they have in common, and give you a short brief on each person, all from
        open research data.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          onClick={onStart}
          className="bg-brand text-white font-semibold px-6 py-3 rounded-lg hover:bg-brand-dark transition-colors"
        >
          Get started
        </button>
        <span className="self-center text-sm text-gray-500">Free. Your first search needs no signup. About 2 minutes to set up.</span>
      </div>

      <div className="mt-12 grid sm:grid-cols-3 gap-4">
        {[
          ["1. Add your keys", "Paste a free OpenAlex key. We show you exactly how to get one."],
          ["2. Pick a starting point", "A publication, a research topic, or a CSV of people you already know."],
          ["3. Explore the network", "See shared collaborators, joint papers and h-index. Export to CSV."],
        ].map(([title, body]) => (
          <div key={title} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-semibold text-ink">{title}</p>
            <p className="mt-1 text-sm text-gray-600">{body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 bg-brand-soft rounded-xl p-5 text-sm text-gray-700 leading-relaxed">
        <p className="font-semibold text-brand-dark">Private by design</p>
        <p className="mt-1">
          Everything runs in your browser. Your keys and any file you upload stay there. Searches go straight
          from your browser to OpenAlex, and to Google only if you turn on AI briefs. Nothing is stored on our
          side, except the email and role you give if you sign up, which go to Jared's Google Form. We only count
          anonymous page visits (no cookies) to see whether the tool is useful. Research data comes from{" "}
          <a className="underline" href="https://openalex.org" target="_blank" rel="noreferrer">
            OpenAlex
          </a>
          , a free, open index of scholarly work.
        </p>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Publication data can mix up people with similar names. Always confirm identity before reaching out.
      </p>

      <div className="mt-10 border-t border-gray-200 pt-6 text-sm text-gray-600">
        Built in public by{" "}
        <a className="text-brand underline" href={LINKEDIN_URL} target="_blank" rel="noreferrer">
          Jared Potter
        </a>
        . Want to hear when new features ship (industry payments, clinical trial roles, saved searches)?{" "}
        <a className="text-brand underline font-medium" href={SIGNUP_URL} target="_blank" rel="noreferrer">
          Get early access
        </a>
        .
      </div>
    </div>
  );
}
