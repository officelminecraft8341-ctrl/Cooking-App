import { AnimatePresence, motion } from 'framer-motion';
import {
  Sparkles, Plus, X, ArrowRight, AlertCircle, Loader2, BookmarkPlus, Flame, Layers3,
  BadgeCheck, TimerReset, Search,
} from 'lucide-react';

const DIET_OPTIONS = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free',
  'Keto', 'Paleo', 'High-Protein', 'Low-Sodium', 'Nut-Free',
];

const CUISINE_OPTIONS = [
  'Italian', 'Mexican', 'Asian', 'Mediterranean',
  'American', 'Indian', 'French', 'Thai', 'Japanese',
];

const draftStages = [
  { title: 'Describe your ingredients', text: 'List what you have, or just name a craving. ChefAI fills in the rest.' },
  { title: 'Set your constraints', text: 'Cuisine, diet, cook time, servings, and accessibility needs shape the result.' },
  { title: 'Iterate with feedback', text: 'Use the chips and feedback buttons to refine the draft without starting over.' },
];

export default function GeneratorView({
  accessibilitySettings,
  form,
  activeRecipe,
  saveSuccess,
  isGenerating,
  genError,
  ingredientActionTarget,
  setIngredientActionTarget,
  onGenerateRecipe,
  onDismissGenError,
  onModifyRecipe,
  onSaveRecipe,
  onOpenDetail,
  onSendChat,
}) {
  const {
    genIngredients, setGenIngredients,
    genCuisines, setGenCuisines,
    fusionModeActive, setFusionModeActive,
    customCuisineInput, setCustomCuisineInput,
    customCuisines, setCustomCuisines,
    genDiet, setGenDiet,
    genTime, setGenTime,
    genServings, setGenServings,
    genDifficulty, setGenDifficulty,
    genStrictMode, setGenStrictMode,
    genAccessibility, setGenAccessibility,
    customAccessibilityInput, setCustomAccessibilityInput,
  } = form;

  const highContrast = accessibilitySettings.highContrast;
  const getIngredientLabel = (ingredient) =>
    typeof ingredient === 'object' ? `${ingredient.amount} ${ingredient.name}` : ingredient;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      {/* ── Left column: form + draft ────────────────────────────────────── */}
      <div className="flex flex-col gap-5">
        <section className={`rounded-[28px] border border-white/70 bg-white/70 p-6 shadow-soft backdrop-blur-xl ${highContrast ? 'border-slate-700 bg-slate-900' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-sm font-medium ${highContrast ? 'text-slate-300' : 'text-slate-500'}`}>AI recipe studio</p>
              <h2 className={`text-2xl font-semibold ${highContrast ? 'text-white' : 'text-slate-900'}`}>Create a recipe</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFusionModeActive(!fusionModeActive);
                  setGenCuisines([]);
                  setCustomCuisines([]);
                }}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                  fusionModeActive
                    ? 'bg-gradient-to-r from-ember to-orange-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {fusionModeActive ? '🌟 FUSION MODE: ON' : 'FUSION MODE: OFF'}
              </button>
            </div>
          </div>

          <form onSubmit={onGenerateRecipe} className="mt-5 space-y-5" id="recipe-generator-form">
            {/* Ingredients */}
            <div>
              <label htmlFor="gen-ingredients" className="block text-sm font-medium text-slate-700">
                Ingredients <span className="text-slate-400 font-normal">(comma-separated)</span>
              </label>
              <input
                id="gen-ingredients"
                type="text"
                value={genIngredients}
                onChange={(e) => setGenIngredients(e.target.value)}
                placeholder="chicken, garlic, lemon, spinach, olive oil…"
                className="mt-2 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-ember focus:ring-1 focus:ring-ember"
              />
            </div>

            {/* Cuisine + Diet */}
            <div className="grid grid-cols-2 gap-4">
              {fusionModeActive ? (
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 mb-2">Click multiple cuisines to fuse them together:</p>
                  <div className="flex flex-wrap gap-2">
                    {CUISINE_OPTIONS.map((c) => {
                      const isSelected = genCuisines.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setGenCuisines(genCuisines.filter((x) => x !== c));
                            } else {
                              setGenCuisines([...genCuisines, c]);
                            }
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                            isSelected
                              ? 'bg-ember/10 border-ember text-ember'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Add custom cuisine (e.g. Peruvian, Korean)"
                      value={customCuisineInput}
                      onChange={(e) => setCustomCuisineInput(e.target.value)}
                      className="flex-1 rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none focus:border-ember"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (customCuisineInput.trim()) {
                            setCustomCuisines([...customCuisines, customCuisineInput.trim()]);
                            setCustomCuisineInput('');
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customCuisineInput.trim()) {
                          setCustomCuisines([...customCuisines, customCuisineInput.trim()]);
                          setCustomCuisineInput('');
                        }
                      }}
                      className="rounded-full bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-700 transition"
                    >
                      + Add
                    </button>
                  </div>
                  {customCuisines.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {customCuisines.map((cc) => (
                        <span
                          key={cc}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-800"
                        >
                          {cc}
                          <button
                            type="button"
                            onClick={() => setCustomCuisines(customCuisines.filter((x) => x !== cc))}
                            className="text-amber-500 hover:text-amber-700 font-bold ml-1"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="col-span-2 grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="gen-cuisine" className="block text-sm font-medium text-slate-700">Cuisine</label>
                    <select
                      id="gen-cuisine"
                      value={genCuisines[0] || ''}
                      onChange={(e) => setGenCuisines([e.target.value])}
                      className="mt-2 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-ember"
                    >
                      <option value="">Any cuisine</option>
                      {CUISINE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                      <option value="Custom">Custom Cuisine...</option>
                    </select>
                    {genCuisines[0] === 'Custom' && (
                      <input
                        type="text"
                        placeholder="Type custom cuisine name..."
                        value={customCuisineInput}
                        onChange={(e) => setCustomCuisineInput(e.target.value)}
                        className="mt-2 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-ember"
                      />
                    )}
                  </div>
                  <div>
                    <label htmlFor="gen-diet" className="block text-sm font-medium text-slate-700">Dietary need</label>
                    <select
                      id="gen-diet"
                      value={genDiet}
                      onChange={(e) => setGenDiet(e.target.value)}
                      className="mt-2 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-ember"
                    >
                      <option value="">No restriction</option>
                      {DIET_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="col-span-2">
                <label htmlFor="gen-difficulty" className="block text-sm font-medium text-slate-700">Difficulty</label>
                <select
                  id="gen-difficulty"
                  value={genDifficulty}
                  onChange={(e) => setGenDifficulty(e.target.value)}
                  className="mt-2 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-ember"
                >
                  <option value="Any">Any difficulty</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
            </div>

            {/* Time + Servings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="gen-time" className="block text-sm font-medium text-slate-700">Cook time</label>
                <input
                  id="gen-time"
                  type="text"
                  placeholder="e.g. 10 mins, 2 hours..."
                  value={genTime}
                  onChange={(e) => setGenTime(e.target.value)}
                  className="mt-2 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-ember"
                />
              </div>
              <div>
                <label htmlFor="gen-servings" className="block text-sm font-medium text-slate-700">Servings</label>
                <input
                  id="gen-servings"
                  type="number"
                  min="1"
                  max="12"
                  value={genServings}
                  onChange={(e) => setGenServings(e.target.value)}
                  className="mt-2 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-ember"
                />
              </div>
            </div>

            {/* Advanced Constraints */}
            <div className="space-y-4 rounded-[20px] border border-slate-200 p-4 bg-slate-50/50">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={genStrictMode}
                  onChange={(e) => setGenStrictMode(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-ember focus:ring-ember"
                />
                <span className="text-sm font-medium text-slate-700">
                  Strict Mode <span className="text-slate-400 font-normal">(Only use listed ingredients)</span>
                </span>
              </label>

              <div>
                <label htmlFor="gen-accessibility" className="block text-sm font-medium text-slate-700">
                  Accessibility Needs <span className="text-slate-400 font-normal">(Adapt instructions)</span>
                </label>
                <select
                  id="gen-accessibility"
                  value={genAccessibility}
                  onChange={(e) => setGenAccessibility(e.target.value)}
                  className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember"
                >
                  <option value="">None</option>
                  <option value="Visual Impairment (need distinct audio/tactile cues)">Visual Impairment</option>
                  <option value="Motor Limitation (need minimal chopping, one-handed tasks)">Motor Limitation</option>
                  <option value="Cognitive/Neurodivergent (need extremely simple, linear steps)">Cognitive / Simplified</option>
                  <option value="Low Energy / Fatigue (need resting phases, minimal active time)">Low Energy / Fatigue</option>
                  <option value="Custom">Custom Need...</option>
                </select>
                {genAccessibility === 'Custom' && (
                  <input
                    type="text"
                    placeholder="Type custom disability/accessibility need..."
                    value={customAccessibilityInput}
                    onChange={(e) => setCustomAccessibilityInput(e.target.value)}
                    className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-ember"
                  />
                )}
              </div>
            </div>

            {genError && (
              <div className="flex items-center gap-2 rounded-[16px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                <AlertCircle size={16} />
                {genError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              {genError && (
                <button
                  type="button"
                  onClick={onDismissGenError}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 transition"
                >
                  Clear
                </button>
              )}
              <button
                type="submit"
                disabled={isGenerating}
                id="generate-recipe-submit"
                className="flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-medium text-white shadow shadow-ember/30 disabled:opacity-60 disabled:cursor-not-allowed transition hover:bg-ember/90"
              >
                {isGenerating ? (
                  <><Loader2 size={16} className="animate-spin" /> Generating…</>
                ) : (
                  <>Generate recipe <ArrowRight size={16} /></>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* ── AI recipe draft ─────────────────────────────────────────────── */}
        <section className={`rounded-[28px] border border-white/70 bg-white/70 p-6 shadow-soft backdrop-blur-xl ${highContrast ? 'border-slate-700 bg-slate-900' : ''}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-sm font-medium ${highContrast ? 'text-slate-300' : 'text-slate-500'}`}>AI recipe draft</p>
              <h2 className={`text-xl font-semibold ${highContrast ? 'text-white' : 'text-slate-900'}`}>
                {activeRecipe ? activeRecipe.title : 'Your AI-created recipe'}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeRecipe && (
                <>
                  <button
                    type="button"
                    aria-label={`Save ${activeRecipe.title}`}
                    onClick={() => onSaveRecipe(activeRecipe)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition ${saveSuccess ? 'bg-emerald-600' : 'bg-slate-900 hover:bg-slate-700'}`}
                  >
                    <BookmarkPlus size={16} />
                    {saveSuccess ? 'Saved!' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenDetail}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:border-ember hover:text-ember"
                  >
                    Full view
                  </button>
                </>
              )}
              {activeRecipe && (
                <button
                  type="button"
                  onClick={() => {
                    setGenIngredients('');
                    setGenCuisines([]);
                    setCustomCuisines([]);
                    setCustomCuisineInput('');
                    setGenDiet('');
                    setGenTime('');
                    setGenServings('2');
                    setGenDifficulty('Any');
                    setGenStrictMode(false);
                    setGenAccessibility('');
                    setCustomAccessibilityInput('');
                  }}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600"
                >
                  New recipe
                </button>
              )}
            </div>
          </div>

          {activeRecipe ? (
            <>
              <p className="mt-3 text-sm leading-6 text-slate-600">{activeRecipe.description}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {activeRecipe.time && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{activeRecipe.time}</span>}
                {activeRecipe.difficulty && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{activeRecipe.difficulty}</span>}
                {activeRecipe.tag && <span className="rounded-full bg-ember/10 px-3 py-1 text-ember">{activeRecipe.tag}</span>}
                {activeRecipe.servings && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Serves {activeRecipe.servings}</span>}
              </div>

              {/* Quick nutrition summary */}
              {activeRecipe.nutrition && (
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {[
                    { label: 'Calories', value: activeRecipe.nutrition.calories, unit: 'kcal' },
                    { label: 'Protein', value: activeRecipe.nutrition.protein },
                    { label: 'Carbs', value: activeRecipe.nutrition.carbs },
                    { label: 'Fat', value: activeRecipe.nutrition.fat },
                    { label: 'Fiber', value: activeRecipe.nutrition.fiber },
                    { label: 'Sodium', value: activeRecipe.nutrition.sodium },
                  ].map((n) => (
                    <div key={n.label} className="rounded-[16px] border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                      <p className="text-xs text-slate-400">{n.label}</p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-800">{n.value}{n.unit ? ` ${n.unit}` : ''}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Ingredient chips with modify actions */}
              {activeRecipe.ingredients?.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Key ingredients</p>
                  <div className="relative mt-2 flex flex-wrap gap-2">
                    {activeRecipe.ingredients.slice(0, 5).map((ing, i) => {
                      const label = getIngredientLabel(ing);
                      return (
                        <div key={i} className="relative">
                          <button
                            onClick={() => setIngredientActionTarget({ name: label })}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm transition hover:border-ember hover:text-ember"
                          >
                            {label}
                          </button>
                          <AnimatePresence>
                            {ingredientActionTarget?.name === label && (
                              <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 5 }}
                                className="absolute left-0 top-full z-10 mt-2 w-40 rounded-xl border border-white/10 bg-slate-900 p-2 shadow-xl"
                              >
                                <p className="mb-2 border-b border-white/10 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Options</p>
                                <button onClick={() => onModifyRecipe('remove', label)} className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-white transition hover:bg-white/10">Remove item</button>
                                <button onClick={() => onModifyRecipe('substitute', label)} className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-white transition hover:bg-white/10">Substitute it</button>
                                <button
                                  onClick={() => setIngredientActionTarget(null)}
                                  className="mt-1 flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-xs text-slate-400 transition hover:bg-white/10"
                                >
                                  <X size={12} /> Close
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                    {activeRecipe.ingredients.length > 5 && (
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-400 shadow-sm">
                        +{activeRecipe.ingredients.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Feedback buttons */}
              <div className="mt-6 flex gap-3 border-t border-slate-100 pt-4">
                <button
                  onClick={() => onModifyRecipe('feedback', '', 'Make this recipe much easier and simpler.')}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  Too hard
                </button>
                <button
                  onClick={() => onModifyRecipe('feedback', '', "This doesn't sound very good, give me something completely different using the same constraints.")}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  Doesn't sound good
                </button>
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <p className="text-sm text-slate-500">Tell ChefAI what you have, what you want, and any restrictions. It will build a personalized recipe with real nutrition and step-by-step instructions.</p>
            </div>
          )}
        </section>
      </div>

      {/* ── Right column: tips + chat hand-off ───────────────────────────── */}
      <div className="flex flex-col gap-5">
        <section className={`rounded-[28px] border border-white/70 p-5 shadow-soft backdrop-blur-xl ${
          highContrast ? 'border-slate-700 bg-slate-900' : 'bg-gradient-to-br from-ember/10 via-white to-emerald/10'
        }`}>
          <div className="flex items-center gap-2 text-ember">
            <Sparkles size={18} />
            <p className="font-semibold">How the studio works</p>
          </div>
          <ol className="mt-4 space-y-3">
            {draftStages.map((stage, index) => (
              <li key={stage.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ember/10 text-xs font-bold text-ember">
                  {index + 1}
                </span>
                <div>
                  <p className={`text-sm font-semibold ${highContrast ? 'text-white' : 'text-slate-900'}`}>{stage.title}</p>
                  <p className={`mt-1 text-sm leading-6 ${highContrast ? 'text-slate-300' : 'text-slate-600'}`}>{stage.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={`rounded-[28px] border p-5 shadow-soft ${highContrast ? 'border-slate-700 bg-slate-900' : 'border-white/70 bg-white/70 backdrop-blur-xl'}`}>
          <div className="flex items-center gap-2 text-ember">
            <Flame size={18} />
            <p className={`font-semibold ${highContrast ? 'text-white' : ''}`}>Locked a draft you like?</p>
          </div>
          <p className={`mt-3 text-sm leading-6 ${highContrast ? 'text-slate-300' : 'text-slate-600'}`}>
            Save it to your collection, or head to ChefAI chat to fine-tune it conversationally — the draft stays in context.
          </p>
          <button
            type="button"
            onClick={onSendChat}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Refine in chat →
          </button>
        </section>

        <section className={`rounded-[28px] border border-white/70 bg-white/70 p-5 shadow-soft backdrop-blur-xl ${highContrast ? 'border-slate-700 bg-slate-900' : ''}`}>
          <div className="flex items-center gap-2 text-ember">
            <Search size={18} />
            <p className={`font-semibold ${highContrast ? 'text-white' : ''}`}>Try prompts like</p>
          </div>
          <ul className={`mt-3 space-y-2 text-sm leading-6 ${highContrast ? 'text-slate-300' : 'text-slate-600'}`}>
            <li className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2">“20-minute high-protein dinner from eggs and spinach”</li>
            <li className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2">“Vegan Thai curry, one pot, mild spice”</li>
            <li className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2">“Use only what's in my strict list”</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
