import Papa from "papaparse";

const NAME_COLS = ["name", "full_name", "fullname", "kol", "kol_name", "researcher", "author", "physician"];
const FIRST_COLS = ["first_name", "firstname", "first", "given_name"];
const LAST_COLS = ["last_name", "lastname", "last", "surname", "family_name"];
const INST_COLS = ["institution", "affiliation", "organization", "organisation", "hospital", "university", "company"];
const ORCID_COLS = ["orcid", "orcid_id"];
const OA_COLS = ["openalex", "openalex_id", "openalex_url"];

const norm = (h) => String(h || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

function pick(row, headers, candidates) {
  const h = headers.find((x) => candidates.includes(norm(x)));
  return h ? String(row[h] || "").trim() : "";
}

/** Parse a CSV of people. Returns { people: [{name, institution, orcid, openalexId}], warnings: [] } */
export function parsePeopleCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const headers = res.meta.fields || [];
        const hasName = headers.some((h) => NAME_COLS.includes(norm(h)));
        const hasFirstLast =
          headers.some((h) => FIRST_COLS.includes(norm(h))) && headers.some((h) => LAST_COLS.includes(norm(h)));
        const hasId = headers.some((h) => [...ORCID_COLS, ...OA_COLS].includes(norm(h)));
        if (!hasName && !hasFirstLast && !hasId) {
          reject(
            new Error(
              'Could not find a name column. Use a column called "name" (or "first_name" and "last_name"). See the template.'
            )
          );
          return;
        }
        const people = res.data
          .map((row) => {
            const name =
              pick(row, headers, NAME_COLS) ||
              [pick(row, headers, FIRST_COLS), pick(row, headers, LAST_COLS)].filter(Boolean).join(" ");
            return {
              name,
              institution: pick(row, headers, INST_COLS),
              orcid: pick(row, headers, ORCID_COLS),
              openalexId: pick(row, headers, OA_COLS),
            };
          })
          .filter((p) => p.name || p.orcid || p.openalexId);
        const warnings = [];
        if (people.length > 25) warnings.push(`Using the first 25 of ${people.length} rows to keep searches fast.`);
        resolve({ people: people.slice(0, 25), warnings });
      },
      error: (err) => reject(err),
    });
  });
}

export const CSV_TEMPLATE = "name,institution,orcid\nJane Example,Example University,\n";

export function downloadText(text, filename, type = "text/csv;charset=utf-8;") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function rowsToCsv(rows) {
  return Papa.unparse(rows, { escapeFormulae: true });
}
