import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';

// Code-split every top-level route: each view ships in its own chunk, so the
// initial bundle stays small (audit item: "massive JS bundles").
const App = lazy(() => import('./App'));
const RecipePage = lazy(() => import('./RecipePage'));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100" role="status" aria-label="Loading ChefAI">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
    </div>
  );
}

function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 px-6 text-center">
      <p className="text-6xl font-black text-orange-500" aria-hidden="true">404</p>
      <h1 className="text-2xl font-semibold text-slate-900">This page isn't on the menu</h1>
      <p className="max-w-md text-sm text-slate-600">
        The page you're looking for doesn't exist or was moved. Let's get you back to the kitchen.
      </p>
      <Link
        to="/"
        className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Back to ChefAI
      </Link>
    </main>
  );
}

// OAuth providers redirect here inside the SAME tab (no popups to block).
// The hash carries the result; we relay it to the app tab via sessionStorage
// + storage events, then jump the user back into the app.
function OauthResult() {
  const location = useLocation();
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    try {
      sessionStorage.setItem('chefai-oauth-result', JSON.stringify({
        ...Object.fromEntries(params.entries()),
        at: Date.now(),
      }));
      // Wake any other ChefAI tab (the main app) up.
      window.dispatchEvent(new StorageEvent('storage', { key: 'chefai-oauth-result' }));
    } catch { /* storage unavailable */ }
    // If this tab IS the app tab (same-tab flow), go home; the app reads the
    // result on focus. Otherwise close the popup.
    if (window.opener && window.opener !== window) {
      try { window.opener.postMessage('chefai-oauth-complete', window.location.origin); } catch { /* cross-origin */ }
      window.close();
    } else {
      window.location.replace('/?view=home');
    }
  }, [location]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100" role="status" aria-label="Completing sign-in">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
        <p className="mt-4 text-sm font-medium text-slate-600">Finishing sign-in…</p>
      </div>
    </main>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/recipe/:recipeName" element={<RecipePage />} />
        <Route path="/oauth-result" element={<OauthResult />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
