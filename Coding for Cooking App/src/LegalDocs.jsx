import { X, ShieldCheck, FileText, Cookie, ReceiptText } from 'lucide-react';
import { useEffect, useRef } from 'react';

// ─── Legal documents ──────────────────────────────────────────────────────────
// Written to describe what ChefAI actually does today: a local-first AI recipe
// app that stores accounts in server/data.json, keeps preferences in
// localStorage, and processes recipe/chat/vision requests through the Hack Club
// AI proxy. No analytics, no advertising, no sale of data, ever.

const DOCS = {
  privacy: {
    title: 'Privacy Policy',
    icon: ShieldCheck,
    updated: 'September 26, 2026',
    sections: [
      {
        h: '1. Who we are',
        p: [
          'ChefAI is an AI-powered cooking assistant ("the Service") operated as a personal/hobby project. For privacy questions or data requests, contact the operator at the email address published where you accessed this app.',
          'We collect the minimum data needed to run the Service. We do not sell your data, we do not run advertising, and we do not use third-party analytics or tracking cookies.',
        ],
      },
      {
        h: '2. Data we collect',
        p: [
          'Account data (only if you create an account): your name, email address, and a salted, hashed password. We never store passwords in plain text.',
          'Recipe data: recipes you save or that ChefAI generates at your request, stored per account.',
          "Technical data: a random session token (stored in your browser's localStorage) so you stay signed in for up to 30 days.",
          'Local preferences: appearance (theme, liquid glass) and accessibility settings are stored only in your browser via localStorage. They are not transmitted to our servers.',
          'If you use the app without an account, recipes generated before sign-in are kept in your browser only.',
        ],
      },
      {
        h: '3. Photos you upload',
        p: [
          'Photos you attach (pantry shots, dish photos, chat images) are sent from your browser directly to the AI service to generate a response. They are processed to produce your recipe or chat reply and are not persisted by ChefAI: our server keeps no copy of uploaded images.',
          'Please do not upload photos containing sensitive personal information that is not needed for cooking.',
        ],
      },
      {
        h: '4. Third-party processing',
        p: [
          'AI features (recipe generation, chat, image recognition, embeddings) are processed through the Hack Club AI proxy (ai.hackclub.com). Your prompts, recipe requests, and any attached photos are transmitted to that service solely to generate your response.',
          'Fonts are loaded from Google Fonts, which may receive your IP address when the font stylesheet is fetched.',
          'We do not embed social media widgets, advertising networks, or analytics scripts.',
        ],
      },
      {
        h: '5. Cookies and similar technologies',
        p: [
          'ChefAI sets no tracking cookies and runs no third-party trackers.',
          'We use localStorage (functionally required, always active) for: your sign-in session, saved recipes, and interface preferences. These are analogous to "strictly necessary cookies" and are not subject to consent.',
          'See the Cookie Policy for details.',
        ],
      },
      {
        h: '6. Legal bases (EEA/UK visitors)',
        p: [
          'Performance of contract: operating your account, saving your recipes, and generating the content you request.',
          "Consent: optional features you explicitly enable (voice guidance uses your browser's speech synthesis; photo features only run when you attach a photo).",
          'Legitimate interests: keeping the Service secure (e.g., hashing passwords, rate-limiting abuse).',
        ],
      },
      {
        h: '7. How long we keep data',
        p: [
          'Account and recipe data are kept until you delete them or delete your account.',
          'Sessions expire after 30 days.',
          'Deleting your account erases your name, email, password hash, sessions, and all saved recipes from our servers immediately.',
        ],
      },
      {
        h: '8. Your rights',
        p: [
          'You can access, export (by saving your recipes), correct, or delete your data at any time:',
          '• Delete saved recipes individually in the Saved view.\n• Delete your whole account from the header account menu — this erases everything immediately.\n• Withdraw consent for optional features by turning them off in the Accessibility panel.',
          'EEA/UK users may also lodge a complaint with their local data protection authority.',
        ],
      },
      {
        h: '9. Security',
        p: [
          'Passwords are hashed (scrypt locally, PBKDF2-100k on Cloudflare) with a per-user random salt. Sign-in sessions use httpOnly, SameSite=Strict cookies — they are never stored where JavaScript can read them. Old bearer tokens in browser storage are wiped automatically. Tokens are stored server-side only as hashes. Login is protected by rate limiting, per-account lockout with exponential backoff, and a captcha after repeated failures. Two-factor authentication (TOTP + single-use backup codes) is available to every account.',
        ],
      },
      {
        h: '9a. No session recording or behavioral tracking',
        p: [
          'ChefAI does not use session replay, heatmaps, screen recording, mouse-tracking, or behavioral analytics of any kind — and our Content-Security-Policy blocks these script categories at the browser level. Form fields are never recorded; there is no third party to mask them from.',
        ],
      },
      {
        h: '9b. Email and messaging',
        p: [
          'ChefAI does not send marketing or promotional email and has no mailing list. There is nothing to unsubscribe from. If transactional email is ever introduced (for example password resets), every message will include a working unsubscribe mechanism and the operator\'s physical postal address, as CAN-SPAM requires.',
        ],
      },
      {
        h: '10. Children',
        p: [
          'ChefAI is not directed at children under 13 (or 16 in the EEA). Signup includes an affirmative age confirmation, and accounts for users under 13 are rejected. We do not knowingly collect children\'s data. If you believe a child has created an account, contact the operator to have it removed.',
        ],
      },
      {
        h: '11. Changes',
        p: [
          'If this policy changes materially, we will update the date at the top and, where practical, notify signed-in users in the app.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    icon: FileText,
    updated: 'September 26, 2026',
    sections: [
      {
        h: '1. Agreement',
        p: ['By using ChefAI ("the Service") you agree to these Terms. If you do not agree, do not use the Service.'],
      },
      {
        h: '2. AI-generated content',
        p: [
          'Recipes, nutrition estimates, timings, and cooking advice are generated by AI models and may be wrong, incomplete, or unsafe for your situation.',
          "ALWAYS verify doneness, cook food to safe internal temperatures, and use your own judgment about allergies, dietary restrictions, and equipment. Nutrition values are estimates, not medical advice.",
          "Never follow AI advice that conflicts with food-safety guidance or your doctor's instructions.",
        ],
      },
      {
        h: '3. Accounts',
        p: [
          'You must provide a valid email and a password of at least 8 characters. You are responsible for keeping your credentials secure.',
          'We may suspend accounts that abuse the Service (e.g., attempting to overload the AI endpoints).',
        ],
      },
      {
        h: '4. Acceptable use',
        p: [
          'Do not upload images you have no right to use, or content that is unlawful, harmful, or infringing. Do not attempt to access other users\' data or disrupt the Service.',
        ],
      },
      {
        h: '5. Your content',
        p: [
          'Your recipes, prompts, and photos remain yours. You grant us only the limited permission needed to process them through the AI service to fulfill your request.',
        ],
      },
      {
        h: '6. Third-party services',
        p: [
          'AI processing is provided via the Hack Club AI proxy; tutorial links open on YouTube or web search. Those services have their own terms, and we are not responsible for their content or availability.',
        ],
      },
      {
        h: '7. Disclaimers',
        p: [
          'THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. To the maximum extent permitted by law, the operator is not liable for any damages arising from your use of the Service, including cooking outcomes, food safety, or reliance on AI-generated content.',
        ],
      },
      {
        h: '8. Termination',
        p: [
          'You can stop using the Service and delete your account at any time. We may modify or discontinue the Service; if we do, we will try to give notice where practical.',
        ],
      },
      {
        h: '9. Governing terms',
        p: [
          'These Terms are for a personal, non-commercial project. Any dispute will first be addressed by contacting the operator. Nothing here limits rights you have under mandatory consumer law in your country.',
        ],
      },
      {
        h: '10. Copyright policy (DMCA)',
        p: [
          'ChefAI generates original recipe text and does not host user-uploaded copyrighted media. Recipes generated for you are created by AI from your prompts and are provided for personal use.',
          'If you believe content available through the Service infringes your copyright, send a takedown notice to the designated agent below with: (1) identification of the copyrighted work, (2) the URL or description of the infringing material, (3) your contact information, (4) a good-faith statement that the use is unauthorized, (5) a statement, under penalty of perjury, that the information is accurate and you are the owner or authorized to act for the owner, and (6) your physical or electronic signature.',
          'Designated DMCA agent: the operator of this site (see the contact address in the Privacy Policy). Valid notices will be acted on promptly, and the affected party will be told how to file a counter-notice.',
        ],
      },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    icon: Cookie,
    updated: 'September 26, 2026',
    sections: [
      {
        h: 'Do we use cookies?',
        p: [
          'No tracking cookies. No advertising cookies. No analytics cookies.',
          'ChefAI sets exactly one HTTP cookie: chefai_session, which keeps you signed in. It is strictly necessary (no consent required under GDPR/ePrivacy because you asked for the service that uses it), HttpOnly so JavaScript can never read or steal it, SameSite=Strict so other sites cannot use it against you, and it expires after 30 days.',
          'Everything else listed below is browser localStorage, used only for things the app cannot function without — equivalent to strictly necessary storage.',
        ],
      },
      {
        h: 'What we store and why',
        list: [
          ['chefai_session (cookie)', 'Keeps you signed in. HttpOnly, SameSite=Strict, 30-day expiry. Strictly necessary.'],
          ['chefai-saved-recipes', 'Recipes generated before you sign in, so they are not lost. Necessary.'],
          ['chefai-appearance-settings', 'Your chosen color theme and liquid-glass preference. Functional preference.'],
          ['chefai-accessibility-settings', 'Your accessibility toggles (high contrast, large text, etc.). Functional preference.'],
          ['chefai-cookie-consent', 'Your cookie/processing consent choices, so we do not ask again. Necessary.'],
        ],
      },
      {
        h: 'Clearing storage',
        p: [
          "Clearing your browser's site data signs you out and resets preferences. Deleting your account also clears the auth entry from your browser.",
        ],
      },
    ],
  },
  refund: {
    title: 'Refund Policy',
    icon: ReceiptText,
    updated: 'September 26, 2026',
    sections: [
      {
        h: 'ChefAI is free',
        p: [
          'ChefAI currently costs nothing: there are no paid plans, subscriptions, or in-app purchases, so there is nothing to refund.',
          'If the operator ever introduces paid features, this page will be updated with clear refund terms before any payment is taken, including how to request a refund and under what conditions.',
          'If you were ever charged for this Service by someone claiming to represent ChefAI, that was not us — do not pay it and contact the operator.',
        ],
      },
    ],
  },
};

function LegalDocs({ docId, onClose }) {
  const panelRef = useRef(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])');
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const doc = DOCS[docId];
  if (!doc) return null;
  const DocIcon = doc.icon;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="presentation">
      <button type="button" aria-label="Close document" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-950/50 backdrop-blur-sm" tabIndex={-1} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-doc-title"
        className="liquid-glass relative flex max-h-[86vh] w-full max-w-3xl flex-col rounded-[28px] border border-white/60 shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-900/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-ember p-2 text-white shadow-lg shadow-ember/30"><DocIcon size={18} /></span>
            <div>
              <h2 id="legal-doc-title" className="text-lg font-semibold text-slate-900">{doc.title}</h2>
              <p className="text-xs text-slate-500">Last updated {doc.updated}</p>
            </div>
          </div>
          <button
            type="button"
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close document"
            className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-600 transition hover:bg-white"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5 text-sm leading-relaxed text-slate-700">
          {doc.sections.map((section) => (
            <section key={section.h} className="mb-6 last:mb-2">
              <h3 className="mb-1.5 text-[15px] font-semibold text-slate-900">{section.h}</h3>
              {section.p?.map((para) => (
                <p key={para.slice(0, 24)} className="mb-2 whitespace-pre-line">{para}</p>
              ))}
              {section.list && (
                <ul className="space-y-1.5">
                  {section.list.map(([key, why]) => (
                    <li key={key} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <code className="text-xs font-semibold text-slate-900">{key}</code>
                      <span className="text-xs text-slate-600">{why}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          <p className="mt-6 border-t border-slate-200 pt-3 text-xs text-slate-500">
            This document describes actual current behavior of the Service. It is provided for information and is not legal advice; the operator is responsible for ensuring compliance with local law.
          </p>
        </div>
      </div>
    </div>
  );
}

export default LegalDocs;
export { DOCS };
