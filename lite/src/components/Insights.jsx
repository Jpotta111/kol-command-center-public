import { useState } from "react";

function Card({ title, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <div className="mt-2 text-sm text-ink">{children}</div>
    </div>
  );
}

export default function Insights({ insights, sharedMin, seedCount, onSelect }) {
  const [open, setOpen] = useState(true);
  if (!insights) return null;
  const { connectors, institutions, pairs, isolated, activeShared } = insights;

  return (
    <div className="bg-gray-50 border-b border-gray-200 px-4 sm:px-6 py-3">
      <button onClick={() => setOpen(!open)} className="text-sm font-semibold text-brand">
        {open ? "Hide" : "Show"} key takeaways
      </button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card title="Best connectors">
            {connectors.length ? (
              <ol className="space-y-1">
                {connectors.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => onSelect(c.id)} className="text-left hover:text-brand">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-gray-500"> works with {c.count} of your {seedCount}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-gray-500">Nobody works with two or more of your starting researchers yet.</p>
            )}
          </Card>

          <Card title="Where shared collaborators sit">
            {institutions.length ? (
              <ul className="space-y-1">
                {institutions.map((i) => (
                  <li key={i.name} className="flex justify-between gap-2">
                    <span className="truncate">{i.name}</span>
                    <span className="text-gray-500 shrink-0">{i.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No institution data yet.</p>
            )}
          </Card>

          <Card title="Your researchers who work together">
            {pairs.length ? (
              <ul className="space-y-1">
                {pairs.map((p) => (
                  <li key={p.ids.join()}>
                    <span className="font-medium">{p.a}</span> and <span className="font-medium">{p.b}</span>
                    <span className="text-gray-500"> ({p.papers} papers)</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">None of your starting researchers have published together recently.</p>
            )}
          </Card>

          <Card title="Worth knowing">
            <ul className="space-y-1.5">
              <li>
                <b>{activeShared}</b> shared collaborators published with your list in the last two years, so they
                are active now.
              </li>
              <li className="text-gray-600">
                "Shared" means they work with {sharedMin} or more of your {seedCount} researchers.
              </li>
              {isolated.length > 0 && (
                <li className="text-amber-800">
                  No overlap with the rest of your list: {isolated.map((s) => s.name).join(", ")}. They may be a
                  separate network worth mapping on their own.
                </li>
              )}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
