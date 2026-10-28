const CONF_LABEL = {
  exact: ["Exact match", "bg-green-100 text-green-800"],
  high: ["Likely match", "bg-green-100 text-green-800"],
  medium: ["Check this", "bg-amber-100 text-amber-800"],
  low: ["Check this", "bg-amber-100 text-amber-800"],
  none: ["No match", "bg-red-100 text-red-700"],
};

export default function ConfirmSeeds({ rows, setRows, source, onBack, onRun, maxSeeds = 25 }) {
  const included = rows.filter((r) => r.include && r.options.length).length;

  function update(i, patch) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <button onClick={onBack} className="text-sm text-brand underline">
        Back
      </button>
      <h2 className="mt-3 text-2xl font-bold text-ink">Confirm your starting researchers</h2>
      <p className="mt-2 text-gray-600">
        From <span className="font-medium">{source?.label}</span>. Untick anyone you do not want, and check the
        matches marked in amber. Names can match the wrong person.
      </p>

      <div className="mt-6 bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {rows.map((r, i) => {
          const opt = r.options[r.selected];
          const [confText, confCls] = r.confidence ? CONF_LABEL[r.confidence] || CONF_LABEL.low : [];
          return (
            <div key={r.key} className="flex items-start gap-3 px-4 py-3">
              <input
                type="checkbox"
                className="mt-1"
                disabled={!r.options.length}
                checked={r.include && !!r.options.length}
                onChange={(e) => update(i, { include: e.target.checked })}
              />
              <div className="flex-1 min-w-0">
                {r.input && <p className="text-xs text-gray-500">From your file: {r.input}</p>}
                {r.options.length > 1 ? (
                  <select
                    className="mt-0.5 w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    value={r.selected}
                    onChange={(e) => update(i, { selected: Number(e.target.value), include: true })}
                  >
                    {r.options.map((o, j) => (
                      <option key={o.id} value={j}>
                        {o.display_name}
                        {o.institution ? `, ${o.institution}` : ""}
                        {o.works_count != null ? ` (${o.works_count} works)` : ""}
                      </option>
                    ))}
                  </select>
                ) : opt ? (
                  <p className="text-sm font-medium text-ink">
                    {opt.display_name}
                    {opt.institution && <span className="font-normal text-gray-500">, {opt.institution}</span>}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">Not found in OpenAlex. Try adding an institution or ORCID.</p>
                )}
                {r.note && <p className="text-xs text-gray-500 mt-0.5">{r.note}</p>}
              </div>
              {confText && <span className={`text-xs font-medium px-2 py-0.5 rounded ${confCls}`}>{confText}</span>}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          onClick={onRun}
          disabled={!included || included > maxSeeds}
          className="bg-brand text-white font-semibold px-6 py-3 rounded-lg hover:bg-brand-dark disabled:opacity-40"
        >
          Map their network ({included})
        </button>
        {included > maxSeeds && (
          <span className="text-sm text-red-600">Pick {maxSeeds} or fewer to keep it fast.</span>
        )}
      </div>
    </div>
  );
}
