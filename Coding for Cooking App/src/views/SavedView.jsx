import { motion } from 'framer-motion';
import { Star, Trash2, Plus, Heart, Clock3 } from 'lucide-react';

export default function SavedView({ savedRecipes, onOpenRecipe, onDeleteSaved, onToggleFavorite, onNavigate, accessibilitySettings }) {
  const highContrast = accessibilitySettings.highContrast;

  const favorites = savedRecipes.filter((recipe) => recipe.isFavorite);
  const others = savedRecipes.filter((recipe) => !recipe.isFavorite);
  const ordered = [...favorites, ...others];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <section className={`rounded-[28px] border border-white/70 bg-white/70 p-6 shadow-soft backdrop-blur-xl ${highContrast ? 'border-slate-700 bg-slate-900' : ''}`}>
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
      </section>
    </div>
  );
}
