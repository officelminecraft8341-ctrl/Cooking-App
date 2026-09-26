import { Cookie, ShieldCheck } from 'lucide-react';

// ─── Cookie / processing consent ──────────────────────────────────────────────
// ChefAI runs no tracking/advertising/analytics cookies, so the banner is a
// plain-language notice of the strictly necessary browser storage (session,
// saved recipes, preferences — always active, never consent-gated) plus an
// opt-in for the two things that ARE optional and external:
//   • aiProcessing — sending your prompts/photos to the Hack Club AI proxy
//   • thirdPartyLinks — opening tutorial links on YouTube / web search
// Nothing optional activates until you choose, and you can change your mind
// any time from the footer. Choices persist in localStorage.

export const CONSENT_STORAGE_KEY = 'chefai-cookie-consent';

export const defaultConsent = {
  decided: false,       // has the user made any choice yet?
  necessary: true,      // always true, not askable
  aiProcessing: false,  // opt-in: prompts/photos processed by Hack Club AI proxy
  thirdPartyLinks: false, // opt-in: open tutorials on YouTube / web search
  decidedAt: null,
};

export function readStoredConsent() {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return { ...defaultConsent };
    return { ...defaultConsent, ...JSON.parse(raw) };
  } catch {
    return { ...defaultConsent };
  }
}

function persistConsent(consent) {
  const record = { ...consent, decided: true, necessary: true, decidedAt: new Date().toISOString() };
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  return record;
}

/**
 * Renders the consent banner. `onDecide(consent)` receives the final record.
 * Nothing else in the app needs to change: necessary storage is used either way.
 */
export function ConsentBanner({ onDecide }) {
  const acceptAll = () => onDecide(persistConsent({ ...defaultConsent, aiProcessing: true, thirdPartyLinks: true }));
  const rejectOptional = () => onDecide(persistConsent(defaultConsent));
  const choose = (key) => onDecide(persistConsent({ ...defaultConsent, [key]: true }));

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie and privacy choices"
      className="liquid-glass fixed bottom-4 left-4 right-4 z-[80] mx-auto max-w-2xl rounded-[24px] border border-white/60 p-4 shadow-2xl sm:bottom-5 sm:left-5 sm:right-auto sm:mx-0"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-ember p-2 text-white shadow-lg shadow-ember/30" aria-hidden="true">
          <Cookie size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">Your privacy choices</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            ChefAI uses <strong>no tracking or advertising cookies</strong>. Only strictly necessary storage is used
            (keeping you signed in and your recipes saved) — that part is always on and needs no consent.
            Two optional extras need your OK:
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
            <li className="flex items-start gap-2 rounded-xl bg-slate-900/5 px-2.5 py-1.5">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ember" aria-hidden="true" />
              <span><strong>AI processing</strong> — your recipe requests, chats, and any photos you attach are sent to the Hack Club AI proxy to generate results. No photo or prompt is stored by us.</span>
            </li>
            <li className="flex items-start gap-2 rounded-xl bg-slate-900/5 px-2.5 py-1.5">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ember" aria-hidden="true" />
              <span><strong>Tutorial links</strong> — "Learn it" links open YouTube or a web search in a new tab, where those sites' own policies apply.</span>
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={acceptAll}
              className="rounded-full bg-ember px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-ember/30 transition hover:brightness-110"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => choose('aiProcessing')}
              className="rounded-full border border-slate-300 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-ember/40"
            >
              AI only
            </button>
            <button
              type="button"
              onClick={() => choose('thirdPartyLinks')}
              className="rounded-full border border-slate-300 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-ember/40"
            >
              Links only
            </button>
            <button
              type="button"
              onClick={rejectOptional}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-700"
            >
              Necessary only
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-500">
            You can change these choices anytime in the footer. Details: Privacy Policy &amp; Cookie Policy.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable consent checkbox for forms. label/required copy is explicit so the
 * user knows exactly what they are agreeing to (GDPR-style informed consent).
 */
export function ConsentCheckbox({ checked, onChange, error }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600 transition hover:border-ember/40">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          required
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-ember focus:ring-ember"
          aria-describedby={error ? 'signup-consent-error' : undefined}
        />
        <span>
          I agree to the <strong>Terms &amp; Conditions</strong> and the <strong>Privacy Policy</strong>, and I understand that
          my recipe requests and chats are processed by an AI service to generate results. I am 13+ (16+ in the EEA).
        </span>
      </label>
      {error && (
        <p id="signup-consent-error" role="alert" className="text-xs font-medium text-red-600">{error}</p>
      )}
    </div>
  );
}
