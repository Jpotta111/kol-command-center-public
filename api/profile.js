/**
 * Vercel serverless function: Gemini-powered KOL profiling.
 *
 * POST /api/profile  (JSON body: array of KOL objects, max 10)
 *
 * For each KOL, fetches recent work titles from OpenAlex, then calls
 * Gemini to generate a profile. Returns a JSON array of profiles.
 * No data is stored server-side.
 */

const OPENALEX_BASE = "https://api.openalex.org";
const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_KOLS_PER_REQUEST = 10;
const GEMINI_DELAY_MS = 1500; // delay between Gemini calls

// OpenAlex: fetch recent work titles

async function fetchRecentTitles(openalexId, email) {
  const shortId = openalexId.replace("https://openalex.org/", "");
  const params = new URLSearchParams({
    filter: `authorships.author.id:${shortId}`,
    per_page: "20",
    select: "id,title,publication_year",
    sort: "publication_year:desc",
    mailto: email,
  });

  try {
    const resp = await fetch(`${OPENALEX_BASE}/works?${params}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.results || []).map((w) => w.title).filter(Boolean);
  } catch {
    return [];
  }
}

// Gemini prompt

function buildPrompt(kol, workTitles) {
  const titlesBlock = workTitles.length
    ? workTitles.slice(0, 20).map((t) => `  - ${t}`).join("\n")
    : "  (no recent titles available)";

  const sv = kol.strategic_value_score ?? 10;
  let industryNote = "Moderate or unknown industry relationships.";
  if (sv >= 15) industryNote = "Low or no industry payments detected.";
  else if (sv <= 8) industryNote = "Significant industry financial relationships detected.";

  const cite = kol.citation_count;
  const citeStr = typeof cite === "number" ? cite.toLocaleString() : (cite || "N/A");
  const tier = kol.kol_tier || kol.tier || "?";

  return `You are an analyst supporting a Medical Affairs team that works in type 2 diabetes and metabolic health.

Analyze this Key Opinion Leader and produce a structured profile.

## KOL Data
- Name: ${kol.display_name || kol.name || "Unknown"}
- Institution: ${kol.institution || "Unknown"}
- h-index: ${kol.h_index ?? "N/A"}
- Total citations: ${citeStr}
- Score: ${kol.ops_score ?? "N/A"}/100 (Tier ${tier})
- Scientific Influence: ${kol.scientific_influence_score ?? "N/A"}/20
- Clinical Alignment: ${kol.clinical_alignment_score ?? "N/A"}/20
- Reach & Visibility: ${kol.reach_visibility_score ?? "N/A"}/20
- Dietary Intervention Openness: ${kol.nutrition_openness_score ?? "N/A"}/20
- Strategic Value: ${sv}/20
- Industry note: ${industryNote}

## Recent Publications (most recent first)
${titlesBlock}

## Instructions
Respond with ONLY a valid JSON object (no markdown, no code fences) with these exact keys:

{
  "outreach_angle": "Specific recommended first-contact angle tailored to their work. Reference a specific paper or research theme, not generic.",
  "sme_briefing": "3 sentences max: what a field team member needs to know before a meeting with this person.",
  "nutrition_stance_assessment": {
    "level": "LOW|MEDIUM|HIGH",
    "reasoning": "1-2 sentences explaining the assessed level of openness to dietary interventions"
  },
  "red_flags": ["list of concerns such as high industry financial ties, public skepticism of dietary intervention, institutional conflicts. Empty array if none."],
  "tier_rationale": "Plain English explanation of why they scored Tier ${tier} (${kol.ops_score ?? "N/A"}/100)"
}`;
}

// Gemini API call

async function callGemini(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg = err?.error?.message || resp.statusText;
    throw new Error(`Gemini ${resp.status}: ${msg}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text.trim();
}

function parseGeminiResponse(raw) {
  let text = raw;
  // Strip markdown code fences if present
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(text);
}

// Main handler

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-OpenAlex-Email, X-Gemini-Key",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { ...corsHeaders, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const apiKey = req.headers["x-gemini-key"]
      || process.env.GEMINI_API_KEY
      || "";
    if (!apiKey) {
      res.writeHead(401, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Gemini API key required. Please add it in Settings." }));
      return;
    }

    const email = req.headers["x-openalex-email"]
      || process.env.OPENALEX_EMAIL
      || "";

    // Parse JSON body
    let body;
    if (typeof req.body === "object" && req.body !== null) {
      body = req.body;
    } else {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      }
      body = JSON.parse(chunks.join(""));
    }

    const kols = Array.isArray(body) ? body : body.kols || [];

    if (!kols.length) {
      res.writeHead(400, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No KOLs provided. Send a JSON array." }));
      return;
    }

    if (kols.length > MAX_KOLS_PER_REQUEST) {
      res.writeHead(400, { ...corsHeaders, "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: `Max ${MAX_KOLS_PER_REQUEST} KOLs per request. Send ${kols.length} in batches.`,
      }));
      return;
    }

    const profiles = [];

    for (let i = 0; i < kols.length; i++) {
      const kol = kols[i];
      const name = kol.display_name || kol.name || "Unknown";

      try {
        const openalexId = kol.openalex_id || "";
        const titles = openalexId
          ? await fetchRecentTitles(openalexId, email)
          : [];

        const prompt = buildPrompt(kol, titles);
        const rawResponse = await callGemini(prompt, apiKey);
        const profile = parseGeminiResponse(rawResponse);

        profiles.push({
          openalex_id: openalexId,
          display_name: name,
          status: "ok",
          ...profile,
        });
      } catch (err) {
        console.error(`Profile failed for ${name}:`, err.message);
        profiles.push({
          openalex_id: kol.openalex_id || "",
          display_name: name,
          status: "error",
          error: err.message,
          outreach_angle: "",
          sme_briefing: "",
          nutrition_stance_assessment: { level: "", reasoning: "" },
          red_flags: [],
          tier_rationale: "",
        });
      }

      // Rate limit between Gemini calls
      if (i < kols.length - 1) {
        await new Promise((r) => setTimeout(r, GEMINI_DELAY_MS));
      }
    }

    res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
    res.end(JSON.stringify(profiles));
  } catch (err) {
    console.error("Profile error:", err);
    res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message || "Internal error" }));
  }
}
