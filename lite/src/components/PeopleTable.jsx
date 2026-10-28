import { useMemo, useState } from "react";
import { CATEGORY } from "./NetworkGraph";

const FILTERS = [
  ["all", "Everyone"],
  ["shared", "Shared collaborators"],
  ["seed", "Your starting researchers"],
  ["other", "Other collaborators"],
];

export default function PeopleTable({ people, seedNames, selectedId, onSelect }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter(
      (p) =>
        (filter === "all" || p.category === filter) &&
        (!needle ||
          p.display_name.toLowerCase().includes(needle) ||
          (p.institution || "").toLowerCase().includes(needle))
    );
  }, [people, filter, q]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-200 bg-white">
        <input
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-64"
          placeholder="Search name or institution"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {FILTERS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-gray-500">{rows.length} people</span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 text-xs text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Institution</th>
              <th className="text-left px-3 py-2">Connected to</th>
              <th className="text-right px-3 py-2">Joint papers</th>
              <th className="text-right px-3 py-2 hidden sm:table-cell">h-index</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={`border-t border-gray-100 cursor-pointer hover:bg-brand-soft/60 ${
                  selectedId === p.id ? "bg-brand-soft" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY[p.category].color }} />
                    <span className="font-medium text-ink">{p.display_name}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600 hidden md:table-cell">{p.institution || "-"}</td>
                <td className="px-3 py-2 text-gray-600">
                  {p.isSeed
                    ? "Starting researcher"
                    : `${p.seedsConnected.length}: ${p.seedsConnected
                        .slice(0, 2)
                        .map((id) => seedNames.get(id))
                        .join(", ")}${p.seedsConnected.length > 2 ? "..." : ""}`}
                </td>
                <td className="px-3 py-2 text-right">{p.isSeed ? "" : p.jointPapers.length}</td>
                <td className="px-3 py-2 text-right hidden sm:table-cell">{p.h_index ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
