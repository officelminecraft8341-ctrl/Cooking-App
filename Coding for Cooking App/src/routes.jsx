import { Routes, Route, Link } from 'react-router-dom';
import { lazy, Suspense } from 'react';

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

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/recipe/:recipeName" element={<RecipePage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
