# KOL Command Center

> **Not a coder?** Try [KOL Discover Lite](lite/), a no-install browser version: start from a paper, a topic or your own CSV and map shared collaborators with your own free keys.

A Key Opinion Leader (KOL) discovery and profiling tool built on public data: OpenAlex and CMS Open Payments. Co-authorship graphs are built with NetworkX, profiles are generated with Gemini, and the dashboard uses React and D3.js.

The included configuration is a demo for type 2 diabetes and metabolic health. Change the topic IDs and keywords in `config/ops_config.json` to target another area.

## What is included

**Pipeline** (Python, `pipeline/`):
1. Queries OpenAlex for researchers by topic
2. Builds a co-authorship network graph (NetworkX)
3. Optionally looks up CMS Open Payments totals from a local parquet file
4. Scores each KOL from 0 to 100 and assigns tiers A/B/C/D
5. Exports `data/kol_graph.json` and `data/kol_export.csv`

**Profiles** (`intelligence/profile_generator.py`): generates structured profiles with Gemini from a scored graph file.

**Dashboard** (React + D3.js, `dashboard/`):
- Network Graph: force-directed co-authorship graph with clickable KOLs
- KOL Table: sortable, filterable table with CSV export of selected rows
- Profile panel: score breakdown and AI profile fields, with on-demand generation
- Settings: stores your Gemini key and OpenAlex email in your browser only

**Serverless function** (`api/profile.js`): Vercel function that generates profiles on demand for the dashboard.

The dashboard has no authentication. Do not deploy it publicly with real data.

## What is not included

The proprietary scoring methodology is not included. `pipeline/ops_scorer.py` is an interface stub that raises `NotImplementedError`. When the stub is unimplemented, the pipeline prints a message and falls back to `pipeline/example_scorer.py`, a simple generic example (normalized h-index, citations, and PageRank blended into a 0-100 score with tiers A/B/C/D). The example scorer is illustrative only and is not a validated methodology. To use your own logic, implement the two functions in `ops_scorer.py`.

## Your keys

This project never ships with anyone's API keys. You use your own, and they stay on your computer (in `.env` for the Python pipeline, or in your browser for the dashboard).

| Key | Needed? | What it does | Where to get it |
|---|---|---|---|
| `OPENALEX_API_KEY` | Recommended | Without it you can run small searches (about the first 200 authors). With it you can page through more results and get a larger daily budget. | Free. Sign in at [openalex.org](https://openalex.org), open account settings, create a key. |
| `OPENALEX_EMAIL` | Optional | Identifies you to OpenAlex. | Your email. |
| `GEMINI_API_KEY` | Optional | Only for AI-written profiles. | Free tier at [aistudio.google.com](https://aistudio.google.com). |

Never commit your `.env` file. It is already in `.gitignore`.

## Quick start

Python 3.10 or newer is required.

```bash
# Pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.example .env   # add your own keys (see "Your keys" below)
# Also set polite_email in config/ops_config.json

# Run the pipeline (20 authors for testing, skipping payment lookups)
python -m pipeline.pipeline -n 20 --skip-payments

# Optional: generate AI profiles for the top 5
python -m intelligence.profile_generator -n 5

# Dashboard
mkdir -p dashboard/public/data
cp data/kol_graph.json data/kol_profiles.json dashboard/public/data/
cd dashboard && npm install && npm run dev
# http://localhost:5173
```

If no data files are present, the dashboard shows fictional sample data from `dashboard/src/sample_data.js`.

To use CMS Open Payments lookups, run `python -m pipeline.download_cms_data --years 2024` first (large download), then run the pipeline without `--skip-payments`.

The "Generate AI profile" button calls `/api/profile`, which needs a Vercel-style runtime (for example `vercel dev`) and your own Gemini key entered in Settings. The function has no server-side key, so a deployment never spends the deployer's credits.

## Architecture

```
pipeline/
  openalex_client.py      OpenAlex API (authors, works)
  open_payments_client.py CMS Open Payments (local parquet)
  download_cms_data.py    CMS CSV to parquet converter
  ops_scorer.py           scoring interface stub (not implemented)
  example_scorer.py       generic example scorer used as fallback
  pipeline.py             orchestrator, writes graph JSON and CSV

intelligence/
  profile_generator.py    Gemini structured profiles

api/
  profile.js              serverless profile endpoint

dashboard/
  src/App.jsx             app shell and tabs
  src/components/         NetworkGraph, KOLTable, ProfilePanel, SettingsModal
  src/sample_data.js      10 fictional KOLs for local development

config/
  ops_config.json         topics, keywords, weights, filters
```

## Configuration

All configuration lives in `config/ops_config.json`. Change the topic IDs, keywords, and concept weights to retarget the pipeline. The `ops_weights` keys (`scientific_influence`, `clinical_alignment`, `reach_visibility`, `nutrition_openness`, `strategic_value`) match the five dimension scores shown in the dashboard.

## Data privacy

- `data/` is gitignored, so real KOL data stays local only
- No proprietary data is committed
- The dashboard sample data is fictional
- CMS Open Payments is public federal data
- OpenAlex is fully open access
