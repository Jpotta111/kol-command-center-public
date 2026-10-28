// Optional AI briefs, called directly from the browser with the user's own Google AI Studio key.

const MODEL = "gemini-2.5-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function testGeminiKey(key) {
  if (!key) return { ok: false, message: "No key entered." };
  try {
    const resp = await fetch(`${BASE}/models?pageSize=1`, { headers: { "x-goog-api-key": key } });
    if (resp.ok) return { ok: true, message: "Key works." };
    if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
      return { ok: false, message: "Google rejected this key." };
    }
    return { ok: false, message: `Google returned an error (${resp.status}).` };
  } catch {
    return { ok: false, message: "Could not reach Google." };
  }
}

function buildPrompt(person, seedNames) {
  const connected = person.seedsConnected.map((id) => seedNames.get(id) || id);
  const papers = person.jointPapers
    .slice(0, 12)
    .map((w) => `- ${w.title} (${w.year || "n.d."}, ${w.cited_by_count} citations)`)
    .join("\n");
  return `You are helping a clinician or medical affairs professional understand a researcher before reaching out.
Use ONLY the facts below. Do not invent affiliations, roles, awards or opinions. If something is unknown, say so.

Researcher: ${person.display_name}
Institution: ${person.institution || "unknown"}
h-index: ${person.h_index ?? "unknown"}; total works: ${person.works_count ?? "unknown"}; total citations: ${person.cited_by_count ?? "unknown"}
Main topics: ${(person.topics || []).join(", ") || "unknown"}
${person.isSeed ? "This is one of the user's starting researchers." : `Connected to the user's researchers: ${connected.join(", ")}`}
${person.isSeed ? "Recent papers:" : "Papers they share with those researchers:"}
${papers || "(none listed)"}

Write a short brief in plain language with these headings:
Research focus (2 sentences)
How they connect to your list (1 to 2 sentences)
Conversation starters (2 bullets, each tied to a specific paper above)
Keep it under 140 words. No em dashes.`;
}

export async function summarizePerson(key, person, seedNames) {
  const resp = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(person, seedNames) }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.error?.message || resp.statusText;
    throw new Error(`Google AI error (${resp.status}): ${msg}`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) throw new Error("The AI returned an empty answer. Try again.");
  return text.trim();
}
