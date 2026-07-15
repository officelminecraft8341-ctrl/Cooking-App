import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import { apiRequest } from './apiClient';
import {
  Sparkles, ChefHat, Clock3, Heart, BookOpen, Soup, CalendarDays,
  ShoppingCart, Microwave, UtensilsCrossed, Accessibility, Search,
  Bell, Plus, X, ArrowRight, Send, Bot, BookmarkPlus, Flame, Layers3,
  BadgeCheck, TimerReset, Loader2, AlertCircle, Star, Trash2,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const highlights = [
  {
    title: 'AI recipe generation',
    text: 'Describe what you have and what you want — ChefAI builds a real recipe with accurate nutrition.',
    icon: Search,
  },
  {
    title: 'Featured recipes',
    text: 'Discover polished recipes tailored to your routine and goals.',
    icon: Sparkles,
  },
  {
    title: 'Meal planner',
    text: 'Preview a weekly rhythm for cooking, shopping, and leftovers.',
    icon: CalendarDays,
  },
];

const DIET_OPTIONS = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free',
  'Keto', 'Paleo', 'High-Protein', 'Low-Sodium', 'Nut-Free',
];

const CUISINE_OPTIONS = [
  'Italian', 'Mexican', 'Asian', 'Mediterranean',
  'American', 'Indian', 'French', 'Thai', 'Japanese',
];

const TIME_OPTIONS = ['15 min', '30 min', '45 min', '1 hour', '1.5 hours'];

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  // Modal visibility
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAccessibilityOpen, setIsAccessibilityOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isRecipeDetailOpen, setIsRecipeDetailOpen] = useState(false);

  // Auth
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Recipes
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [savedRecipes, setSavedRecipes] = useState([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Recipe generator form
  const [genIngredients, setGenIngredients] = useState('');
  const [genCuisines, setGenCuisines] = useState([]);
  const [fusionModeActive, setFusionModeActive] = useState(false);
  const [customCuisineInput, setCustomCuisineInput] = useState('');
  const [customCuisines, setCustomCuisines] = useState([]);
  const [genDiet, setGenDiet] = useState('');
  const [genTime, setGenTime] = useState('');
  const [genServings, setGenServings] = useState('2');
  const [genDifficulty, setGenDifficulty] = useState('Any');
  const [genStrictMode, setGenStrictMode] = useState(false);
  const [genAccessibility, setGenAccessibility] = useState('');
  const [customAccessibilityInput, setCustomAccessibilityInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  // Interactive ingredients state
  const [ingredientActionTarget, setIngredientActionTarget] = useState(null);
  const [detailRecipe, setDetailRecipe] = useState(null);

  // Chat
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hi! Tell me what ingredients you have, what you want to eat, and any dietary preferences. I\'ll help you create a custom recipe.',
    },
  ]);
  const chatBottomRef = useRef(null);

  // ── Persist saved recipes to localStorage ─────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('chefai-saved-recipes');
    if (stored) {
      try { setSavedRecipes(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('chefai-saved-recipes', JSON.stringify(savedRecipes));
  }, [savedRecipes]);

  useEffect(() => {
    if (chatBottomRef.current && typeof chatBottomRef.current.scrollIntoView === 'function') {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── Recipe Generation ─────────────────────────────────────────────────────
  const handleGenerateRecipe = async (event) => {
    event.preventDefault();
    const finalCuisines = fusionModeActive
      ? [...genCuisines, ...customCuisines]
      : [genCuisines[0] === 'Custom' ? customCuisineInput : (genCuisines[0] || '')];

    const finalAccessibility = genAccessibility === 'Custom' ? customAccessibilityInput : genAccessibility;

    if (!genIngredients.trim() && finalCuisines.filter(Boolean).length === 0 && !genDiet) {
      setGenError('Please describe what you have or what you want to cook.');
      return;
    }

    setIsGenerating(true);
    setGenError('');

    try {
      const data = await apiRequest('/recipes/generate', {
        method: 'POST',
        body: {
          ingredients: genIngredients.split(',').map((s) => s.trim()).filter(Boolean),
          cuisines: finalCuisines.filter(Boolean),
          diet: genDiet,
          time: genTime,
          servings: parseInt(genServings, 10) || 2,
          difficulty: genDifficulty,
          strictMode: genStrictMode,
          accessibility: finalAccessibility,
        },
      });

      if (!data.recipe) {
        throw new Error(data.error || 'Failed to generate recipe');
      }

      setActiveRecipe(data.recipe);
      setIsModalOpen(false);

      // Reset form
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
    } catch (error) {
      setGenError(error.message || 'Something went wrong. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleModifyRecipe = async (action, target, message = '') => {
    if (!activeRecipe) return;
    setIsGenerating(true);
    setIngredientActionTarget(null); // Close popover if open

    try {
      const data = await apiRequest('/recipes/generate', {
        method: 'POST',
        body: {
          modifyRequest: { action, target, message, existingRecipe: activeRecipe },
        },
      });
      if (!data.recipe) throw new Error(data.error || 'Failed to modify recipe');
      
      setActiveRecipe(data.recipe);
    } catch (error) {
      alert(error.message || 'Something went wrong.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Save Recipe ───────────────────────────────────────────────────────────
  const handleSaveRecipe = async (recipe) => {
    if (!recipe) return;

    // Optimistically save to state
    setSavedRecipes((current) => {
      if (current.some((r) => r.title === recipe.title)) return current;
      return [...current, { ...recipe, savedAt: new Date().toISOString(), isFavorite: false }];
    });

    // Also send to server (in-memory store for now)
    try {
      await apiRequest('/recipes', {
        method: 'POST',
        body: recipe,
      }).catch(() => {});
    } catch { /* server save is best-effort; localStorage is the fallback */ }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleDeleteSaved = (title) => {
    setSavedRecipes((current) => current.filter((r) => r.title !== title));
  };

  const handleToggleFavorite = (title) => {
    setSavedRecipes((current) =>
      current.map((r) => r.title === title ? { ...r, isFavorite: !r.isFavorite } : r)
    );
  };

  // ── Chat ──────────────────────────────────────────────────────────────────
  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!chatInput.trim()) return;

    const message = chatInput.trim();
    const updatedHistory = [...messages, { role: 'user', content: message }];
    setMessages(updatedHistory);
    setChatInput('');
    setIsChatLoading(true);
    setChatError('');

    try {
      const data = await apiRequest('/chat', {
        method: 'POST',
        body: {
          message,
          history: messages, // full history for context
          recipe: activeRecipe, // current recipe context
        },
      });

      setMessages((current) => [...current, { role: 'assistant', content: data.reply }]);
    } catch (error) {
      setChatError('ChefAI is temporarily unavailable. Please try again.');
      // Remove the user message we added optimistically on hard fail
    } finally {
      setIsChatLoading(false);
    }
  };

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleSignIn = (event) => {
    event.preventDefault();
    if (email && password) {
      setIsSignedIn(true);
      setIsAuthOpen(false);
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: `Welcome back! Ready to cook something great today?` },
      ]);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getIngredientLabel = (ingredient) => {
    if (typeof ingredient === 'object') return `${ingredient.amount} ${ingredient.name}`;
    return ingredient;
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,122,24,0.16),_transparent_30%),linear-gradient(135deg,#fffdf9_0%,#f8fafc_100%)] text-slate-800">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center justify-between rounded-[28px] border border-white/70 bg-white/70 px-6 py-5 shadow-soft backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-ember p-3 text-white shadow-lg shadow-ember/30">
              <ChefHat size={22} />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">ChefAI</p>
              <p className="text-sm text-slate-500">Premium AI cooking assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="rounded-full border border-slate-200 bg-white/80 p-2.5 text-slate-600 transition hover:border-ember hover:text-ember"
              onClick={() => setIsAccessibilityOpen(true)}
              aria-label="Open accessibility options"
            >
              <Accessibility size={18} />
            </button>
            <button className="rounded-full border border-slate-200 bg-white/80 p-2.5 text-slate-600 transition hover:border-ember hover:text-ember" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <button
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              onClick={() => setIsAuthOpen(true)}
              aria-label="Open sign in"
            >
              {isSignedIn ? '✓ Signed in' : 'Sign in'}
            </button>
          </div>
        </header>

        {/* ── Hero + Highlights ───────────────────────────────────────────── */}
        <main className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <section className="rounded-[32px] border border-white/70 bg-white/70 p-6 shadow-soft backdrop-blur-xl sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-ember/10 px-3 py-1 text-sm font-medium text-ember">
                  <Sparkles size={16} /> AI-powered culinary guidance
                </p>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                  Cook beautifully, plan effortlessly.
                </h1>
                <p className="mt-4 text-lg text-slate-600">
                  ChefAI turns pantry ingredients, preferences, and time constraints into inspiring recipes — with real nutrition, real instructions, and real cooking guidance.
                </p>
              </div>
              <button
                className="flex items-center gap-2 rounded-full bg-ember px-4 py-2.5 font-medium text-white shadow-lg shadow-ember/30 transition hover:translate-y-[-1px] hover:shadow-ember/40"
                onClick={() => setIsModalOpen(true)}
                id="open-recipe-generator"
              >
                <Plus size={18} /> Create a recipe
              </button>
            </div>

            {/* Quick input bar */}
            <div className="mt-8 rounded-[28px] border border-slate-200/80 bg-slate-950/95 p-5 text-white shadow-2xl">
              <form onSubmit={(e) => { e.preventDefault(); setIsModalOpen(true); }} className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/10 px-4 py-3 text-sm text-slate-300">
                <Search size={16} />
                <input
                  placeholder="I have chicken, garlic, and lemon — make something Italian…"
                  className="w-full bg-transparent outline-none placeholder:text-slate-400"
                  aria-label="Quick recipe idea"
                  onClick={() => setIsModalOpen(true)}
                  readOnly
                />
              </form>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Try asking</p>
                  <p className="mt-2 text-xl font-semibold">What can I make with eggs, cheese, and spinach?</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <Microwave size={20} />
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-300">
                {['20 minutes', 'Vegetarian', 'High protein', 'No dairy', 'Italian'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1 transition hover:bg-white/20"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {highlights.map((item) => {
                const Icon = item.icon;
                return (
                  <motion.article
                    key={item.title}
                    whileHover={{ y: -4, scale: 1.01 }}
                    className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4"
                  >
                    <div className="mb-3 inline-flex rounded-2xl bg-white p-2 text-ember shadow-sm">
                      <Icon size={18} />
                    </div>
                    <h2 className="font-semibold text-slate-900">{item.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                  </motion.article>
                );
              })}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[32px] border border-white/70 bg-white/70 p-5 shadow-soft backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">AI recipe studio</p>
                  <h2 className="text-xl font-semibold text-slate-900">Create from conversation</h2>
                </div>
              </div>
              <div className="mt-4 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Ask ChefAI to create your first recipe from your pantry, dietary needs, or mood. The generator will build you a real recipe with ingredients, steps, and nutrition.
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-4 w-full rounded-full bg-ember px-4 py-2.5 text-sm font-medium text-white shadow shadow-ember/30 transition hover:bg-ember/90"
              >
                Generate a recipe →
              </button>
            </section>

            <section className="rounded-[32px] border border-white/70 bg-gradient-to-br from-ember/10 via-white to-emerald/10 p-5 shadow-soft backdrop-blur-xl">
              <div className="flex items-center gap-2 text-ember">
                <BookOpen size={18} />
                <p className="font-semibold">Cooking mode</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Full-screen guidance with step-by-step progress, voice ready controls, timers, and ingredient checklists.
              </p>
            </section>
          </aside>
        </main>

        {/* ── Active Recipe Card ──────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto">
          <div className="rounded-[32px] border border-white/70 bg-white/70 p-6 shadow-soft backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">AI recipe draft</p>
                <h2 className="text-xl font-semibold text-slate-900">
                  {activeRecipe ? activeRecipe.title : 'Your AI-created recipe'}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeRecipe && (
                  <>
                    <button
                      type="button"
                      aria-label={`Save ${activeRecipe.title}`}
                      onClick={() => handleSaveRecipe(activeRecipe)}
                      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition ${saveSuccess ? 'bg-emerald-600' : 'bg-slate-900 hover:bg-slate-700'}`}
                    >
                      <BookmarkPlus size={16} />
                      {saveSuccess ? 'Saved!' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDetailRecipe(activeRecipe); setIsRecipeDetailOpen(true); }}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:border-ember hover:text-ember"
                    >
                      Full view
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600"
                >
                  {activeRecipe ? 'Regenerate' : 'Create'}
                </button>
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

                {/* Top 3 ingredients preview */}
                {activeRecipe.ingredients?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Key ingredients</p>
                    <div className="mt-2 flex flex-wrap gap-2 relative">
                      {activeRecipe.ingredients.slice(0, 5).map((ing, i) => {
                        const label = getIngredientLabel(ing);
                        return (
                          <div key={i} className="relative">
                            <button 
                              onClick={() => setIngredientActionTarget({ name: label })}
                              className="rounded-full bg-white border border-slate-200 px-3 py-1 text-xs text-slate-600 shadow-sm hover:border-ember hover:text-ember transition"
                            >
                              {label}
                            </button>
                            <AnimatePresence>
                              {ingredientActionTarget?.name === label && (
                                <motion.div
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 5 }}
                                  className="absolute top-full left-0 mt-2 z-10 w-40 rounded-xl bg-slate-900 p-2 shadow-xl border border-white/10"
                                >
                                  <p className="px-2 pb-2 text-[10px] uppercase text-slate-400 font-semibold tracking-wider border-b border-white/10 mb-2">Options</p>
                                  <button onClick={() => handleModifyRecipe('remove', label)} className="w-full text-left rounded-lg px-2 py-1.5 text-xs text-white hover:bg-white/10 transition">Remove item</button>
                                  <button onClick={() => handleModifyRecipe('substitute', label)} className="w-full text-left rounded-lg px-2 py-1.5 text-xs text-white hover:bg-white/10 transition">Substitute it</button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                      {activeRecipe.ingredients.length > 5 && (
                        <span className="rounded-full bg-white border border-slate-200 px-3 py-1 text-xs text-slate-400 shadow-sm">
                          +{activeRecipe.ingredients.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Feedback Buttons */}
                <div className="mt-6 flex gap-3 pt-4 border-t border-slate-100">
                  <button 
                    onClick={() => handleModifyRecipe('feedback', '', 'Make this recipe much easier and simpler.')}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                  >
                    Too hard
                  </button>
                  <button 
                    onClick={() => handleModifyRecipe('feedback', '', 'This doesn\'t sound very good, give me something completely different using the same constraints.')}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                  >
                    Doesn't sound good
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-sm text-slate-500">Tell ChefAI what you have, what you want, and any restrictions. It will build a personalized recipe with real nutrition and step-by-step instructions.</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white"
                >
                  <Sparkles size={15} /> Generate my first recipe
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── Saved Recipes + Chat ────────────────────────────────────────── */}
        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Saved recipes */}
          <div className="rounded-[32px] border border-white/70 bg-white/70 p-6 shadow-soft backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Saved recipes</p>
                <h2 className="text-xl font-semibold text-slate-900">Your collection</h2>
              </div>
              <span className="rounded-full bg-ember/10 px-3 py-1 text-sm font-medium text-ember">
                {savedRecipes.length} saved
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {savedRecipes.length === 0 ? (
                <p className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Generate a recipe and save it to build your personal kitchen library.
                </p>
              ) : (
                savedRecipes.map((recipe) => (
                  <motion.div
                    key={recipe.title}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 truncate">{recipe.title}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {recipe.time} • {recipe.difficulty}
                          {recipe.nutrition?.calories ? ` • ${recipe.nutrition.calories} kcal` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleToggleFavorite(recipe.title)}
                          aria-label={`Favorite ${recipe.title}`}
                          className={`rounded-full p-1.5 transition ${recipe.isFavorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                        >
                          <Star size={16} fill={recipe.isFavorite ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          onClick={() => { setDetailRecipe(recipe); setIsRecipeDetailOpen(true); }}
                          className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-ember hover:text-ember transition"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleDeleteSaved(recipe.title)}
                          aria-label={`Delete ${recipe.title}`}
                          className="rounded-full p-1.5 text-slate-300 transition hover:text-red-400"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    {recipe.tag && (
                      <span className="mt-2 inline-block rounded-full bg-ember/10 px-2.5 py-0.5 text-xs font-medium text-ember">
                        {recipe.tag}
                      </span>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Chat */}
          <div className="rounded-[32px] border border-white/70 bg-slate-950/95 p-6 text-white shadow-soft flex flex-col">
            <div className="flex items-center gap-2">
              <Bot size={18} />
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">ChefAI chat</p>
            </div>
            {activeRecipe && (
              <div className="mt-2 rounded-[16px] border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
                Context: <span className="text-slate-300">{activeRecipe.title}</span>
              </div>
            )}
            <div className="mt-4 flex-1 space-y-3 overflow-y-auto max-h-72 rounded-[24px] border border-white/10 bg-white/10 p-4 scrollbar-thin">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`whitespace-pre-line rounded-[18px] px-3 py-2 text-sm ${
                    message.role === 'assistant'
                      ? 'bg-white/10 text-slate-200'
                      : 'bg-ember/80 text-white ml-4'
                  }`}
                >
                  {message.content}
                </div>
              ))}
              {isChatLoading && (
                <div className="flex items-center gap-2 rounded-[18px] bg-white/10 px-3 py-2 text-sm text-slate-400">
                  <Loader2 size={14} className="animate-spin" />
                  ChefAI is thinking…
                </div>
              )}
              {chatError && (
                <div className="flex items-center gap-2 rounded-[18px] bg-red-900/30 px-3 py-2 text-xs text-red-300">
                  <AlertCircle size={14} />
                  {chatError}
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
            <form onSubmit={handleSendMessage} className="mt-4 flex items-center gap-2 rounded-[20px] border border-white/10 bg-white/10 p-2">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask ChefAI anything about cooking…"
                className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
                aria-label="Ask ChefAI"
                disabled={isChatLoading}
              />
              <button
                type="submit"
                disabled={isChatLoading || !chatInput.trim()}
                className="rounded-full bg-ember p-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                {isChatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </div>
        </section>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MODALS
      ════════════════════════════════════════════════════════════════════ */}

      {/* ── Recipe Generator Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="w-full max-w-lg rounded-[30px] border border-white/70 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">AI recipe studio</p>
                  <h2 className="text-2xl font-semibold text-slate-900">Create a recipe</h2>
                </div>
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setGenError(''); }}
                  className="rounded-full border border-slate-200 p-2 text-slate-600 hover:border-ember hover:text-ember transition"
                  aria-label="Close recipe generator"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleGenerateRecipe} className="mt-6 space-y-5">
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
                  <div className="col-span-2 flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-sm font-semibold text-slate-700">Cuisine Selection</span>
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

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setIsModalOpen(false); setGenError(''); }}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isGenerating}
                    id="generate-recipe-submit"
                    className="flex items-center gap-2 rounded-full bg-ember px-5 py-2 text-sm font-medium text-white shadow shadow-ember/30 disabled:opacity-60 disabled:cursor-not-allowed transition hover:bg-ember/90"
                  >
                    {isGenerating ? (
                      <><Loader2 size={16} className="animate-spin" /> Generating…</>
                    ) : (
                      <>Generate recipe <ArrowRight size={16} /></>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full Recipe Detail Modal ───────────────────────────────────── */}
      <AnimatePresence>
        {isRecipeDetailOpen && detailRecipe && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="w-full max-w-2xl rounded-[30px] border border-white/70 bg-white shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white/90 px-6 py-4 backdrop-blur-sm rounded-t-[30px]">
                <div>
                  <span className="rounded-full bg-ember/10 px-3 py-1 text-xs font-medium text-ember">{detailRecipe.tag}</span>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">{detailRecipe.title}</h2>
                </div>
                <button
                  onClick={() => setIsRecipeDetailOpen(false)}
                  className="rounded-full border border-slate-200 p-2 text-slate-600 hover:border-ember hover:text-ember transition"
                  aria-label="Close recipe detail"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Meta */}
                <div className="flex flex-wrap gap-2 text-sm">
                  {detailRecipe.time && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{detailRecipe.time}</span>}
                  {detailRecipe.difficulty && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{detailRecipe.difficulty}</span>}
                  {detailRecipe.servings && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Serves {detailRecipe.servings}</span>}
                  {detailRecipe.cuisine && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{detailRecipe.cuisine}</span>}
                </div>

                <p className="text-slate-600 leading-7">{detailRecipe.description}</p>

                {/* Nutrition */}
                {detailRecipe.nutrition && (
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Flame size={16} className="text-ember" /> Nutrition (per serving, approx.)</h3>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {[
                        { label: 'Calories', value: `${detailRecipe.nutrition.calories} kcal` },
                        { label: 'Protein', value: detailRecipe.nutrition.protein },
                        { label: 'Carbs', value: detailRecipe.nutrition.carbs },
                        { label: 'Fat', value: detailRecipe.nutrition.fat },
                        { label: 'Fiber', value: detailRecipe.nutrition.fiber },
                        { label: 'Sodium', value: detailRecipe.nutrition.sodium },
                      ].map((n) => (
                        <div key={n.label} className="rounded-[14px] border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                          <p className="text-xs text-slate-400">{n.label}</p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-800">{n.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ingredients */}
                {detailRecipe.ingredients?.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Layers3 size={16} className="text-ember" /> Ingredients</h3>
                    <ul className="mt-3 space-y-2">
                      {detailRecipe.ingredients.map((ing, i) => (
                        <li key={i} className="flex items-center gap-3 rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
                          <BadgeCheck size={14} className="text-ember shrink-0" />
                          {getIngredientLabel(ing)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Instructions */}
                {detailRecipe.instructions?.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-slate-900"><BookOpen size={16} className="text-ember" /> Instructions</h3>
                    <ol className="mt-3 space-y-3">
                      {detailRecipe.instructions.map((step, i) => (
                        <li key={i} className="flex gap-3 rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3">
                          <span className="shrink-0 rounded-full bg-ember/10 text-ember text-xs font-bold w-6 h-6 flex items-center justify-center mt-0.5">{i + 1}</span>
                          <p className="text-sm text-slate-700 leading-6">{step}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Tips */}
                {detailRecipe.tips && (
                  <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/60 p-4">
                    <h3 className="flex items-center gap-2 font-semibold text-emerald-800"><TimerReset size={16} /> Chef tips</h3>
                    <p className="mt-2 text-sm text-emerald-700 leading-6">{detailRecipe.tips}</p>
                  </div>
                )}

                {/* Substitutions */}
                {detailRecipe.substitutions?.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2">Substitutions</h3>
                    <ul className="space-y-1">
                      {detailRecipe.substitutions.map((sub, i) => (
                        <li key={i} className="text-sm text-slate-600">• {sub}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleSaveRecipe(detailRecipe)}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium text-white transition ${saveSuccess ? 'bg-emerald-600' : 'bg-slate-900 hover:bg-slate-700'}`}
                  >
                    <BookmarkPlus size={16} /> {saveSuccess ? 'Saved!' : 'Save recipe'}
                  </button>
                  <button
                    onClick={() => setIsRecipeDetailOpen(false)}
                    className="rounded-full border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sign In Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {isAuthOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="w-full max-w-md rounded-[30px] border border-white/70 bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">Welcome</p>
                  <h2 className="text-2xl font-semibold text-slate-900">
                    {isSignedIn ? 'You are signed in' : 'Sign in to ChefAI'}
                  </h2>
                </div>
                <button type="button" onClick={() => setIsAuthOpen(false)} className="rounded-full border border-slate-200 p-2 text-slate-600" aria-label="Close sign in">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleSignIn} className="mt-6 space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Email
                  <input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-ember" />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Password
                  <input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-ember" />
                </label>
                <button type="submit" className="w-full rounded-full bg-ember px-4 py-2.5 font-medium text-white shadow shadow-ember/30 hover:bg-ember/90 transition">
                  Continue
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Accessibility Panel ───────────────────────────────────────── */}
      <AnimatePresence>
        {isAccessibilityOpen && (
          <motion.div
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            className="fixed bottom-5 right-5 z-40 w-[320px] rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Accessibility</p>
                <h2 className="text-lg font-semibold text-slate-900">Personalize experience</h2>
              </div>
              <button type="button" onClick={() => setIsAccessibilityOpen(false)} className="rounded-full border border-slate-200 p-2 text-slate-600" aria-label="Close accessibility panel">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {['High contrast', 'Large text', 'Dyslexia font', 'Reduce motion', 'Voice guidance'].map((option) => (
                <label key={option} className="flex items-center justify-between rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 cursor-pointer hover:border-ember/30 transition">
                  <span>{option}</span>
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-ember focus:ring-ember" />
                </label>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
