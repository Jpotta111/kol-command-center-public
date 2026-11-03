import { SIGNUP_URL, LINKEDIN_URL, STRIPE_FOUNDING_LINK } from "../config";

const PLANS = [
  {
    name: "Founding partner",
    price: "$3,500",
    note: "per month, locked for life. First 5 teams only.",
    items: ["Growth-level limits while you are a partner", "Direct line to the builder and a say in the roadmap", "Annual prepay: 2 months free"],
    highlight: true,
  },
  {
    name: "Starter",
    price: "$2,500",
    note: "per month",
    items: ["Planned: 3 seats", "1 therapeutic area", "100 KOLs watched"],
  },
  {
    name: "Growth",
    price: "$5,000",
    note: "per month",
    items: ["Planned: 10 seats", "3 therapeutic areas", "500 KOLs watched"],
  },
];

export default function Pricing() {
  return (
    <div className="min-h-full bg-[#f7f8f9]">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          <a href="/" className="font-bold text-ink tracking-tight">
            KOL Discovery <span className="text-brand">Team</span>
          </a>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <p className="text-sm font-semibold tracking-wide text-brand uppercase">Pricing</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-ink">KOL intelligence for Medical Affairs teams without a six-figure budget</h1>
        <p className="mt-4 text-lg text-gray-600 max-w-3xl">
          KOL Discovery Team is the paid version of the free Lite tool, being built with its first customers. The plan:
          a weekly email telling your team which of your KOLs are publishing guidelines, running trials or have gone
          quiet. Public data only (OpenAlex and PubMed today; clinical trial and payments data planned). No claims or
          prescribing data.
        </p>

        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-xl p-6 border ${p.highlight ? "border-brand bg-white shadow-md" : "border-gray-200 bg-white"}`}
            >
              <h2 className="font-semibold text-ink">{p.name}</h2>
              <p className="mt-3 text-3xl font-bold text-ink">{p.price}</p>
              <p className="text-sm text-gray-500">{p.note}</p>
              <ul className="mt-4 space-y-2 text-sm text-gray-700">
                {p.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 bg-brand-soft rounded-xl p-6">
          <h2 className="text-xl font-bold text-brand-dark">Start a founding partnership</h2>
          <p className="mt-2 text-sm text-gray-700 max-w-2xl">
            Weekly digests are not built yet. Founding partners shape what gets built first and are not billed until
            their first automated weekly digest is delivered. Tell us about your team and we will set up a short call.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={SIGNUP_URL}
              target="_blank"
              rel="noreferrer"
              className="bg-brand text-white font-semibold px-6 py-3 rounded-lg hover:bg-brand-dark"
            >
              Start a founding partnership
            </a>
            {STRIPE_FOUNDING_LINK && (
              <a
                href={STRIPE_FOUNDING_LINK}
                target="_blank"
                rel="noreferrer"
                className="border border-brand text-brand font-semibold px-6 py-3 rounded-lg bg-white"
              >
                Pay by card
              </a>
            )}
          </div>
        </div>

        <div className="mt-10 grid sm:grid-cols-2 gap-6 text-sm text-gray-700">
          <div>
            <h3 className="font-semibold text-ink">What it is not</h3>
            <p className="mt-1">
              It is not a replacement for enterprise platforms that include claims data. It is the watch layer for
              teams that cannot buy those.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-ink">Try it free first</h3>
            <p className="mt-1">
              <a className="text-brand underline" href="/">KOL Discovery Lite</a> maps KOL networks for free, and the
              List Audit checks who on your speaker list has guideline, trial or review evidence.
            </p>
          </div>
        </div>
        <p className="mt-10 text-xs text-gray-400">
          Built in public by{" "}
          <a className="underline" href={LINKEDIN_URL} target="_blank" rel="noreferrer">
            Jared Potter
          </a>
          . Plan limits are targets, not commitments, until your agreement says otherwise. Prices may change for later customers.
        </p>
      </main>
    </div>
  );
}
