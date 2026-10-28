import { useState } from "react";
import { ROLES, LINKEDIN_URL } from "../config";
import { EMAIL_RE, submitSignup } from "../lib/signup";

export default function SignupGate({ reason, onDone, onCancel }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!role) {
      setError("Please pick the option that best describes you.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitSignup({ email, role: role === "Other" ? other.trim() || "Other" : role });
      onDone();
    } catch {
      setError("Could not reach Google to save your email. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Free full access</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Enter your email to keep going</h2>
        <p className="mt-2 text-sm text-gray-600">
          {reason || "Unlock unlimited searches, CSV export and AI briefs."} It stays free. You will get occasional
          updates from{" "}
          <a className="underline" href={LINKEDIN_URL} target="_blank" rel="noreferrer">
            Jared Potter
          </a>{" "}
          about new features. Unsubscribe anytime by replying to any update.
        </p>

        <label className="block mt-5 text-sm font-medium text-ink">
          Email
          <input
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="you@example.com"
          />
        </label>

        <label className="block mt-4 text-sm font-medium text-ink">
          What best describes you?
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
          >
            <option value="">Choose one</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="Other">Other</option>
          </select>
        </label>
        {role === "Other" && (
          <input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Your role"
            className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="bg-brand text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "Saving..." : "Unlock full access"}
          </button>
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">
            Not now
          </button>
        </div>
        <p className="mt-4 text-[11px] text-gray-400">
          Only your email and role are sent, to a Google Form owned by Jared Potter. Your keys, searches and files
          are never included.
        </p>
      </form>
    </div>
  );
}
