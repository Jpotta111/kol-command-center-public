"""
OpenAlex API client for KOL discovery.

Queries the OpenAlex /authors endpoint filtered by topic IDs defined in
config/ops_config.json. Returns author dicts suitable for downstream scoring.
"""

import json
import logging
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

import os

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load .env from the repo root if present (OPENALEX_API_KEY, OPENALEX_EMAIL)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def auth_params() -> dict:
    """Return the user's own OpenAlex API key as a query param, if set.

    OpenAlex works without a key for small runs, but a free key is required
    to page past the first page of results and gives a larger daily budget.
    Get one free at https://openalex.org (account settings).
    """
    key = os.environ.get("OPENALEX_API_KEY", "").strip()
    return {"api_key": key} if key else {}

BASE_URL = "https://api.openalex.org"
PER_PAGE = 200
RATE_LIMIT_MS = 100  # ms between requests


def load_config(config_path: str | None = None) -> dict:
    """Load ops_config.json from the config directory."""
    if config_path is None:
        config_path = str(
            Path(__file__).resolve().parent.parent / "config" / "ops_config.json"
        )
    with open(config_path) as f:
        return json.load(f)


def _build_topic_filter(topics: list[dict]) -> str:
    """Build an OR filter string for multiple topic IDs."""
    ids = [t["id"] for t in topics]
    return "|".join(ids)


def _parse_author(raw: dict) -> dict:
    """Extract the fields we need from an OpenAlex author record."""
    institution = None
    last_known = raw.get("last_known_institutions") or []
    if last_known:
        institution = last_known[0].get("display_name")

    # Topics (preferred) with x_concepts as fallback
    concepts = []
    topic_source = raw.get("topics") or raw.get("x_concepts") or []
    for c in topic_source:
        concepts.append({
            "id": c.get("id", ""),
            "display_name": c.get("display_name", ""),
            "score": c.get("score", 0),
        })

    return {
        "openalex_id": raw.get("id", ""),
        "display_name": raw.get("display_name", ""),
        "orcid": raw.get("orcid"),
        "institution": institution,
        "h_index": (raw.get("summary_stats") or {}).get("h_index", 0),
        "citation_count": raw.get("cited_by_count", 0),
        "pub_count": raw.get("works_count", 0),
        "concepts": concepts,
        "recent_work_titles": [],  # populated by _fetch_recent_work_titles
        "coauthor_ids": [],  # populated in pipeline.py
    }


def _is_recently_active(raw: dict, years: int) -> bool:
    """Check if author published within the last N years."""
    counts_by_year = raw.get("counts_by_year") or []
    if not counts_by_year:
        return False
    cutoff = datetime.now().year - years
    return any(
        entry.get("year", 0) >= cutoff and entry.get("works_count", 0) > 0
        for entry in counts_by_year
    )


def _fetch_recent_work_titles(
    author_ids: list[str], email: str, works_per_author: int = 20
) -> dict[str, list[str]]:
    """
    Fetch recent work titles for a list of authors.

    Queries the OpenAlex /works endpoint once per author. Returns a dict
    mapping openalex_id to a list of recent work title strings.
    """
    result: dict[str, list[str]] = {aid: [] for aid in author_ids}

    for author_id in author_ids:
        short_id = author_id.replace("https://openalex.org/", "")
        params = {
            "filter": f"authorships.author.id:{short_id}",
            "per_page": works_per_author,
            "select": "id,title,publication_year",
            "sort": "publication_year:desc",
            "mailto": email,
            **auth_params(),
        }
        url = f"{BASE_URL}/works?{urlencode(params)}"

        resp = None
        for attempt in range(3):
            try:
                resp = requests.get(url, timeout=30)
                if resp.status_code == 429:
                    time.sleep(2 ** attempt)
                    resp = None
                    continue
                resp.raise_for_status()
                break
            except requests.exceptions.RequestException:
                resp = None
                if attempt == 2:
                    break
                time.sleep(2 ** attempt)

        if resp is None:
            continue

        works = resp.json().get("results", [])
        result[author_id] = [w["title"] for w in works if w.get("title")]
        time.sleep(RATE_LIMIT_MS / 1000)

    return result


def fetch_authors(
    config: dict | None = None,
    max_authors: int | None = None,
) -> list[dict]:
    """
    Fetch authors from OpenAlex filtered by configured topics.

    Args:
        config: Loaded config dict. If None, loads from default path.
        max_authors: Override target_author_count from config.

    Returns:
        List of parsed author dicts.
    """
    if config is None:
        config = load_config()

    target = max_authors or config.get("target_author_count", 500)
    email = config.get("polite_email", "")
    topics = config.get("openalex_topics", [])
    filters = config.get("filters", {})
    min_pubs = filters.get("min_publications", 5)
    min_cites = filters.get("min_citations", 50)
    years_active = filters.get("years_active_recent", 3)

    topic_filter = _build_topic_filter(topics)

    # Filter: topics + minimum works + minimum citations
    api_filter = (
        f"topics.id:{topic_filter},"
        f"works_count:>{min_pubs},"
        f"cited_by_count:>{min_cites}"
    )

    authors = []
    cursor = "*"
    page = 0

    while len(authors) < target and cursor is not None:
        params = {
            "filter": api_filter,
            "per_page": PER_PAGE,
            "cursor": cursor,
            "sort": "cited_by_count:desc",
            "mailto": email,
            **auth_params(),
        }
        url = f"{BASE_URL}/authors?{urlencode(params)}"

        if page > 0:
            time.sleep(RATE_LIMIT_MS / 1000)

        # Request with retry on 429
        for attempt in range(3):
            try:
                resp = requests.get(url, timeout=30)
                if resp.status_code == 401 and page > 0:
                    resp = None
                    break
                if resp.status_code == 429:
                    wait = 2 ** attempt
                    logger.warning("Rate limited (429), waiting %ds...", wait)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                break
            except requests.exceptions.RequestException as e:
                if attempt == 2:
                    logger.error("Failed after 3 attempts: %s", e)
                    raise
                time.sleep(2 ** attempt)
        else:
            break

        if resp is None:
            logger.warning(
                "OpenAlex requires an API key to fetch more than one page of "
                "results. Continuing with the %d authors collected so far. "
                "Add a free OPENALEX_API_KEY to your .env to fetch more.",
                len(authors),
            )
            break

        data = resp.json()
        results = data.get("results", [])

        if not results:
            break

        for raw in results:
            if len(authors) >= target:
                break
            if not _is_recently_active(raw, years_active):
                continue
            authors.append(_parse_author(raw))

        meta = data.get("meta", {})
        cursor = meta.get("next_cursor")
        page += 1

        logger.info(
            "Page %d: fetched %d results, %d authors collected so far",
            page, len(results), len(authors),
        )

    logger.info("Total authors fetched: %d", len(authors))

    # Fetch recent work titles for keyword matching
    if authors:
        logger.info("Fetching recent work titles for %d authors...", len(authors))
        author_ids = [a["openalex_id"] for a in authors]
        titles_map = _fetch_recent_work_titles(author_ids, email)
        for a in authors:
            a["recent_work_titles"] = titles_map.get(a["openalex_id"], [])
        titles_found = sum(1 for a in authors if a["recent_work_titles"])
        logger.info("Work titles populated for %d/%d authors", titles_found, len(authors))

    return authors


# ---------------------------------------------------------------------------
# CLI test harness
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    print("Loading config...")
    cfg = load_config()
    print(f"Therapeutic area: {cfg['therapeutic_area']}")
    print(f"Topics: {[t['label'] for t in cfg['openalex_topics']]}")
    print()

    print("Fetching first batch of authors from OpenAlex...")
    authors = fetch_authors(config=cfg, max_authors=10)

    print(f"\n{'=' * 70}")
    print(f"{'#':<4} {'Name':<35} {'Citations':>10} {'H-Index':>8} {'Pubs':>6}")
    print(f"{'=' * 70}")
    for i, a in enumerate(authors, 1):
        print(
            f"{i:<4} {a['display_name']:<35} "
            f"{a['citation_count']:>10,} "
            f"{a['h_index']:>8} "
            f"{a['pub_count']:>6}"
        )
    print(f"{'=' * 70}")
    print(f"\nTotal authors returned: {len(authors)}")
