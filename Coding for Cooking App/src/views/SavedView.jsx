import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Star, Trash2, Plus, Heart, Clock3, Search, Sparkles, AlertCircle, ChefHat, X, ArrowRight } from 'lucide-react';
import { searchRecipes } from '../semanticSearch';

export default function SavedView({ savedRecipes, savedIdeas = [], onOpenRecipe, onDeleteSaved, onToggleFavorite, onNavigate, accessibilitySettings, onCookIdea, onDeleteIdea }) {
  const highContrast = accessibilitySettings.highContrast;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(null); // 'semantic' | 'keyword' | 'error'
  const debounceRef = useRef(null);
  const requestSeqRef = useRef(0);

  // Debounced semantic search — falls back to keyword scoring offline
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      setSearchMode(null);
      setIsSearching(false);
      return undefined;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const seq = requestSeqRef.current + 1;
      requestSeqRef.current = seq;
      try {
        const ranked = await searchRecipes(trimmed, savedRecipes);
        if (requestSeqRef.current !== seq) return;
        setResults(ranked);
        setSearchMode(ranked[0]?.mode || 'semantic');
      } catch {
        if (requestSeqRef.current !== seq) return;
        setSearchMode('error');
      } finally {
        if (requestSeqRef.current === seq) setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(debounceRef.current);
  }, [query, savedRecipes]);

  const showRanked = query.trim().length > 0 && results.length > 0;
  const favorites = useMemo(() => savedRecipes.filter((recipe) => recipe.isFavorite), [savedRecipes]);
  const ordered = useMemo(() => {
    if (showRanked) return results.map((entry) => ({ ...entry.recipe, searchScore: entry.score }));
    const others = savedRecipes.filter((recipe) => !recipe.isFavorite);
    return [...favorites, ...others];
  }, [showRanked, results, savedRecipes, favorites]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <section className="liquid-glass rounded-[28px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`text-sm font-medium ${highContrast ? 'text-slate-300' : 'text-slate-500'}`}>Saved recipes</p>
            <h2 className={`text-2xl font-semibold ${highContrast ? 'text-white' : 'text-slate-900'}`}>Your collection</h2>
          </div>
          <div className="flex items-center gap-2">
            {favorites.length > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
                {favorites.length} favorited
              </span>
            )}
            <span className="rounded-full bg-ember/10 px-3 py-1 text-sm font-medium text-ember">
              {savedRecipes.length} saved
            </span>
            <button
              type="button"
              onClick={() => onNavigate('generate')}
              className="flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white shadow shadow-ember/30 transition hover:bg-ember/90"
            >
              <Plus size={16} /> New recipe
            </button>
          </div>
        </div>

        {/* ── Semantic search ────────────────────────────────────────────── */}
        {savedRecipes.length > 0 && (
          <div className="mt-5">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by craving — “something creamy and herby”…"
                aria-label="Search saved recipes"
                className="w-full rounded-[18px] border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-10 text-sm outline-none focus:border-ember focus:ring-1 focus:ring-ember"
              />
              {isSearching && (
                <Sparkles size={15} className="absolute right-4 top-1/2 -translate-y-1/2 animate-pulse text-ember" />
              )}
            </div>
            {query.trim() && searchMode === 'keyword' && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <AlertCircle size={12} /> Semantic search unavailable — showing keyword matches.
              </p>
            )}
            {query.trim() && searchMode === 'semantic' && !isSearching && (
              <p className="mt-2 text-xs text-slate-400">Ranked by semantic similarity ✨</p>
            )}
          </div>
        )}

        {savedRecipes.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <Heart size={28} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">Nothing saved yet.</p>
            <p className="mt-1 text-sm text-slate-400">Generate a recipe and save it to build your personal kitchen library.</p>
            <button
              type="button"
              onClick={() => onNavigate('generate')}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white shadow shadow-ember/30"
            >
              <Plus size={16} /> Generate my first recipe
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ordered.map((recipe) => (
              <motion.article
                key={recipe.title}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`group flex flex-col rounded-[22px] border p-4 transition ${
                  recipe.isFavorite
                    ? 'border-amber-200 bg-amber-50/70'
                    : highContrast
                      ? 'border-slate-600 bg-slate-800'
                      : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenRecipe(recipe)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <h3 className={`truncate font-semibold ${highContrast ? 'text-white' : 'text-slate-900'}`}>{recipe.title}</h3>
                    <p className={`mt-1 flex items-center gap-1.5 text-sm ${highContrast ? 'text-slate-300' : 'text-slate-500'}`}>
                      <Clock3 size={13} /> {recipe.time} • {recipe.difficulty}
                      {recipe.nutrition?.calories ? ` • ${recipe.nutrition.calories} kcal` : ''}
                    </p>
                    {typeof recipe.searchScore === 'number' && (
                      <span className="mt-1 inline-block rounded-full bg-ember/10 px-2 py-0.5 text-[11px] font-medium text-ember">
                        {Math.round(recipe.searchScore * 100)}% match
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(recipe.title)}
                    aria-label={`Favorite ${recipe.title}`}
                    aria-pressed={Boolean(recipe.isFavorite)}
                    className={`rounded-full p-1.5 transition ${recipe.isFavorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                  >
                    <Star size={16} fill={recipe.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                </div>

                {recipe.description && (
                  <p className={`mt-2 line-clamp-2 text-sm leading-6 ${highContrast ? 'text-slate-300' : 'text-slate-600'}`}>
                    {recipe.description}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {recipe.tag && (
                    <span className="rounded-full bg-ember/10 px-2.5 py-0.5 text-xs font-medium text-ember">{recipe.tag}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenRecipe(recipe)}
                    className={`ml-auto rounded-full border px-3 py-1 text-xs transition ${
                      highContrast
                        ? 'border-slate-500 text-slate-200 hover:border-ember hover:text-ember'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-ember hover:text-ember'
                    }`}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSaved(recipe.title)}
                    aria-label={`Delete ${recipe.title}`}
                    className={`rounded-full p-1.5 transition ${highContrast ? 'text-slate-400 hover:text-red-300' : 'text-slate-300 hover:text-red-400'}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.article>
            ))}
          </div>
        )}

        {/* ── Starred AI brainstorms → turn into full recipes ─────────────── */}
        {savedIdeas.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-ember" />
              <h3 className={`text-sm font-semibold uppercase tracking-wide ${highContrast ? 'text-slate-200' : 'text-slate-500'}`}>
                AI recipe drafts ({savedIdeas.length})
              </h3>
            </div>
            <p className={`mt-1 text-xs ${highContrast ? 'text-slate-300' : 'text-slate-400'}`}>
              Brainstorms you starred in Generate. Cook one to build the full recipe.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {savedIdeas.map((idea) => (
                <motion.article
                  key={idea.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`relative flex flex-col rounded-[22px] border border-dashed p-4 ${
                    highContrast ? 'border-slate-500 bg-slate-800' : 'border-ember/40 bg-ember/5'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onDeleteIdea(idea.id)}
                    aria-label={`Discard draft ${idea.title}`}
                    className={`absolute right-3 top-3 rounded-full p-1 transition ${highContrast ? 'text-slate-400 hover:text-red-300' : 'text-slate-300 hover:text-red-400'}`}
                  >
                    <X size={14} />
                  </button>
                  <p className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                    idea.complexity === 'Simple' ? 'bg-emerald-100 text-emerald-700' : idea.complexity === 'Ambitious' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    <ChefHat size={11} /> {idea.complexity}
                  </p>
                  <h4 className={`mt-2 pr-6 font-semibold ${highContrast ? 'text-white' : 'text-slate-900'}`}>{idea.title}</h4>
                  {idea.description && (
                    <p className={`mt-1 line-clamp-2 text-sm leading-5 ${highContrast ? 'text-slate-300' : 'text-slate-500'}`}>{idea.description}</p>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <span className={`flex items-center gap-1 text-xs ${highContrast ? 'text-slate-300' : 'text-slate-400'}`}>
                      <Clock3 size={12} /> {idea.time || '—'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onCookIdea(idea)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-ember px-3 py-1.5 text-xs font-medium text-white transition hover:bg-ember/90"
                    >
                      Cook this <ArrowRight size={12} />
                    </button>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
