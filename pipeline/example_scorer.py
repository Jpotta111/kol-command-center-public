"""
EXAMPLE SCORER (illustrative only).

This is a simple, generic scoring example that follows the same interface as
pipeline/ops_scorer.py. It exists so the pipeline and dashboard can run end to
end on public data. It is NOT a production methodology and makes no claim of
predictive validity. Replace it with your own logic.

Each of five dimensions is computed as a 0-1 fraction, then scaled by the
weights in config/ops_config.json ("ops_weights") to produce a 0-100 total:

  scientific_influence : blend of h-index percentile and PageRank (normalized)
  clinical_alignment   : overlap between author concepts and configured topics
  reach_visibility     : log-scaled citation count
  nutrition_openness   : keyword hits in recent titles and concepts
  strategic_value      : lower when public payment totals are higher

Tiers: A (>= 80), B (>= 60), C (>= 40), D (below 40), configurable via
"tier_thresholds" in the config.
"""

import math

import networkx as nx

DIMENSIONS = [
    "scientific_influence",
    "clinical_alignment",
    "reach_visibility",
    "nutrition_openness",
    "strategic_value",
]

DIMENSION_MAX = 20.0  # per-dimension display scale used by the dashboard
CITATION_CEILING = 100_000
PAYMENT_CEILING_LOG10 = 6.0  # about 1,000,000 USD maps to zero strategic value


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def _percentile(value, population) -> float:
    if not population:
        return 0.0
    return sum(1 for p in population if p <= value) / len(population)


def precompute_centrality(graph, config=None) -> dict:
    """PageRank on the co-authorship graph, scaled so the maximum is 1.0."""
    if graph is None or graph.number_of_nodes() == 0:
        return {}
    pr = nx.pagerank(graph, weight="weight")
    top = max(pr.values()) or 1.0
    return {node: value / top for node, value in pr.items()}


def _author_text(author: dict) -> str:
    parts = list(author.get("recent_work_titles") or [])
    for c in author.get("concepts") or []:
        parts.append(c.get("display_name", "") if isinstance(c, dict) else str(c))
    return " ".join(parts).lower()


def _clinical_alignment(author: dict, config: dict) -> float:
    concept_names = [
        (c.get("display_name", "") if isinstance(c, dict) else str(c)).lower()
        for c in author.get("concepts") or []
    ]
    matched = 0.0
    for item in config.get("openalex_concepts", []) + config.get("openalex_topics", []):
        label = item.get("label", "").lower()
        if label and any(label in n or (n and n in label) for n in concept_names):
            matched += float(item.get("weight", 1.0))
    return _clamp(matched / 2.0)


def _nutrition_openness(author: dict, config: dict) -> float:
    text = _author_text(author)
    hits = sum(1 for kw in config.get("nutrition_keywords", []) if kw.lower() in text)
    return _clamp(hits / 3.0)


def _strategic_value(pharma_data) -> float:
    if not pharma_data or not pharma_data.get("data_available"):
        return 0.5  # neutral when no payment data was looked up
    total = pharma_data.get("total_payments_usd") or 0.0
    return _clamp(1.0 - math.log10(1.0 + total) / PAYMENT_CEILING_LOG10)


def _tier(score: float, thresholds: dict) -> str:
    if score >= thresholds.get("A", 80):
        return "A"
    if score >= thresholds.get("B", 60):
        return "B"
    if score >= thresholds.get("C", 40):
        return "C"
    return "D"


def compute_ops_score(author, pharma_data=None, graph=None,
                      config=None, population_h_indices=None,
                      centrality_map=None, contact=None,
                      pubmed_data=None):
    """Return ops_score (0-100), tier, and five per-dimension scores (0-20)."""
    config = config or {}
    weights = config.get("ops_weights", {})
    thresholds = config.get("tier_thresholds", {"A": 80, "B": 60, "C": 40})

    h_pct = _percentile(author.get("h_index", 0), population_h_indices or [])
    pagerank = (centrality_map or {}).get(author.get("openalex_id"), 0.0)
    citations = max(0, author.get("citation_count", 0) or 0)

    fractions = {
        "scientific_influence": _clamp(0.5 * h_pct + 0.5 * pagerank),
        "clinical_alignment": _clinical_alignment(author, config),
        "reach_visibility": _clamp(math.log1p(citations) / math.log1p(CITATION_CEILING)),
        "nutrition_openness": _nutrition_openness(author, config),
        "strategic_value": _strategic_value(pharma_data),
    }

    weight_sum = sum(float(weights.get(d, 20)) for d in DIMENSIONS) or 1.0
    total = sum(fractions[d] * float(weights.get(d, 20)) for d in DIMENSIONS)
    ops_score = round(total / weight_sum * 100.0, 1)

    result = {f"{d}_score": round(fractions[d] * DIMENSION_MAX, 1) for d in DIMENSIONS}
    result["ops_score"] = ops_score
    result["tier"] = _tier(ops_score, thresholds)
    return result
