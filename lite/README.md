# KOL Discover Lite

Find the researchers connected to the experts you care about. Start from a publication, a research topic, or a CSV of people you already know. The app maps who they publish with, highlights the collaborators they have in common, and lets you export everything to CSV.

## How it works

1. **Add your keys.** A free [OpenAlex](https://openalex.org) key is recommended. A free [Google AI Studio](https://aistudio.google.com/apikey) key is optional, for AI briefs. The app shows step-by-step instructions for both.
2. **Pick a starting point.** Paste a DOI or paper title, type a topic, or upload a CSV with a `name` column (optional `institution` and `orcid`).
3. **Confirm the people.** Name matches are labeled by confidence so you can fix wrong matches.
4. **Explore.** Network view, sortable list, per-person panel with joint papers, h-index, topics, ORCID and PubMed links, and an optional AI brief.

## Privacy and keys

- It is a static website. There is no backend, database or server-side key.
- Keys are held in memory, or in this browser's local storage only if the user ticks "Remember my keys on this device".
- Requests go directly from the browser to OpenAlex, and to Google only when someone asks for an AI brief.
- Uploaded CSV files are read in the browser and never sent anywhere.
- OpenAlex usage is billed to the user's own free daily allowance. The header shows the running cost for the session.

## Run it locally

Needs Node.js 18 or newer.

```bash
cd lite
npm install
npm run dev
# open http://localhost:5173
```

`npm run build` produces a static site in `lite/dist` that can be hosted anywhere (Vercel, Netlify, GitHub Pages). No environment variables are needed or read.

## Limits

- Up to 25 starting researchers per search, and papers from the last 3, 5 or 10 years (up to 200 per person).
- Papers with more than 30 authors are skipped when building connections, so large consortium papers do not swamp the results.
- The graph shows the starting researchers plus the top 120 collaborators. The list and CSV include everyone found.
- Author data comes from OpenAlex and can merge or split people with similar names. Always confirm identity before outreach.

Data: [OpenAlex](https://openalex.org) (CC0).
