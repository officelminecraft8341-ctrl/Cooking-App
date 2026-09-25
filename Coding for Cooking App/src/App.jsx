import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from './apiClient';
import {
  ChefHat, Accessibility, Bell, X, Sparkles, BookOpen, Bot,
  Plus, Heart, Layers3, BadgeCheck, TimerReset, Flame, BookmarkPlus,
} from 'lucide-react';
import HomeView from './views/HomeView';
import GeneratorView from './views/GeneratorView';
import SavedView from './views/SavedView';
import ChatView from './views/ChatView';

const ACCESSIBILITY_STORAGE_KEY = 'chefai-accessibility-settings';

const defaultAccessibilitySettings = {
  highContrast: false,
  largeText: false,
  dyslexiaFont: false,
  reduceMotion: false,
  voiceGuidance: false,
};

const accessibilityOptionLabels = [
  { key: 'highContrast', label: 'High contrast' },
  { key: 'largeText', label: 'Large text' },
  { key: 'dyslexiaFont', label: 'Dyslexia font' },
  { key: 'reduceMotion', label: 'Reduce motion' },
  { key: 'voiceGuidance', label: 'Voice guidance' },
];

// ─── View definitions ─────────────────────────────────────────────────────────

const VIEWS = [
  {
    id: 'home',
    label: 'Home',
    icon: Sparkles,
    accent: 'from-ember to-orange-400',
    description: 'Welcome and quick start',
  },
  {
    id: 'generate',
    label: 'Generate',
    icon: Plus,
    accent: 'from-ember to-amber-400',
    description: 'AI recipe studio',
  },
  {
    id: 'saved',
    label: 'Saved',
    icon: Heart,
    accent: 'from-emerald to-teal-400',
    description: 'Your recipe collection',
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: Bot,
    accent: 'from-ember to-rose-400',
    description: 'ChefAI conversation',
  },
];

const VIEW_IDS = VIEWS.map((view) => view.id);

function isValidViewId(value) {
  return VIEW_IDS.includes(value);
}

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  // View switcher
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const initialView = isValidViewId(requestedView) ? requestedView : 'home';
  const [activeView, setActiveView] = useState(initialView);
  const [swipeDirection, setSwipeDirection] = useState(0);
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false);

  // Modals
  const [isAccessibilityOpen, setIsAccessibilityOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isRecipeDetailOpen, setIsRecipeDetailOpen] = useState(false);
  const [accessibilitySettings, setAccessibilitySettings] = useState(defaultAccessibilitySettings);

  // Auth
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Recipes
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [savedRecipes, setSavedRecipes] = useState([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [detailRecipe, setDetailRecipe] = useState(null);
  const [ingredientActionTarget, setIngredientActionTarget] = useState(null);

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

  // Chat
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! Tell me what ingredients you have, what you want to eat, and any dietary preferences. I'll help you create a custom recipe.",
    },
  ]);
  const chatBottomRef = useRef(null);

  // ── URL sync for the active view ──────────────────────────────────────────
  const navigateToView = useCallback((viewId) => {
    if (!isValidViewId(viewId)) return;
    setSwipeDirection(VIEW_IDS.indexOf(viewId) - VIEW_IDS.indexOf(activeView));
    setActiveView(viewId);
    setSearchParams(viewId === 'home' ? {} : { view: viewId }, { replace: false });
  }, [activeView, setSearchParams]);

  useEffect(() => {
    if (requestedView && isValidViewId(requestedView) && requestedView !== activeView) {
      setSwipeDirection(VIEW_IDS.indexOf(requestedView) - VIEW_IDS.indexOf(activeView));
      setActiveView(requestedView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedView]);

  const shiftView = useCallback((delta) => {
    const currentIndex = VIEW_IDS.indexOf(activeView);
    const nextIndex = Math.min(VIEW_IDS.length - 1, Math.max(0, currentIndex + delta));
    if (nextIndex !== currentIndex) {
      navigateToView(VIEW_IDS[nextIndex]);
    }
  }, [activeView, navigateToView]);

  // ── Keyboard navigation (arrow keys switch views) ─────────────────────────
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isAnyModalOpen) return;
      const target = event.target;
      const isTypingContext =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (isTypingContext) return;

      if (event.key === 'ArrowRight') {
        shiftView(1);
      } else if (event.key === 'ArrowLeft') {
        shiftView(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnyModalOpen, shiftView]);

  useEffect(() => {
    setIsAnyModalOpen(isAccessibilityOpen || isAuthOpen || isRecipeDetailOpen);
  }, [isAccessibilityOpen, isAuthOpen, isRecipeDetailOpen]);

  // ── Persist saved recipes to localStorage ─────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('chefai-saved-recipes');
    if (stored) {
      try { setSavedRecipes(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    const storedSettings = localStorage.getItem(ACCESSIBILITY_STORAGE_KEY);
    if (storedSettings) {
      try {
        const parsed = JSON.parse(storedSettings);
        setAccessibilitySettings({ ...defaultAccessibilitySettings, ...parsed });
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(accessibilitySettings));
  }, [accessibilitySettings]);

  useEffect(() => {
    const root = document.body;
    root.classList.toggle('accessibility-high-contrast', accessibilitySettings.highContrast);
    root.classList.toggle('accessibility-large-text', accessibilitySettings.largeText);
    root.classList.toggle('accessibility-dyslexia-font', accessibilitySettings.dyslexiaFont);
    root.classList.toggle('accessibility-reduce-motion', accessibilitySettings.reduceMotion);
    root.classList.toggle('accessibility-voice-guidance', accessibilitySettings.voiceGuidance);

    document.documentElement.style.setProperty('--app-font-scale', accessibilitySettings.largeText ? '1.08' : '1');
    document.documentElement.style.setProperty('--app-motion-scale', accessibilitySettings.reduceMotion ? '0.75' : '1');

    if (accessibilitySettings.voiceGuidance && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance('Accessibility features are enabled. You can use the recipe generator with voice guidance.');
      utterance.lang = 'en-US';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  }, [accessibilitySettings]);

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

  const handleOpenRecipeDetail = (recipe) => {
    setDetailRecipe(recipe);
    setIsRecipeDetailOpen(true);
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
  const toggleAccessibilitySetting = (setting) => {
    setAccessibilitySettings((current) => ({ ...current, [setting]: !current[setting] }));
  };

  const reduceMotionEnabled = accessibilitySettings.reduceMotion;

  const generatorForm = useMemo(() => ({
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
  }), [genIngredients, genCuisines, fusionModeActive, customCuisineInput, customCuisines, genDiet, genTime, genServings, genDifficulty, genStrictMode, genAccessibility, customAccessibilityInput]);

  const highContrast = accessibilitySettings.highContrast;
  const dyslexiaStyle = accessibilitySettings.dyslexiaFont
    ? { fontFamily: 'Atkinson Hyperlegible, "Comic Sans MS", "Segoe UI", sans-serif' }
    : undefined;

  const activeIndex = VIEW_IDS.indexOf(activeView);

  return (
    <div
      className={`flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,122,24,0.16),_transparent_30%),linear-gradient(135deg,#fffdf9_0%,#f8fafc_100%)] text-slate-800 ${highContrast ? 'bg-slate-950 text-slate-50' : ''}`}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/70 bg-white/70 px-4 py-3 shadow-soft backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-ember p-2.5 text-white shadow-lg shadow-ember/30">
            <ChefHat size={20} />
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">ChefAI</p>
            <p className="text-xs text-slate-500">Premium AI cooking assistant</p>
          </div>
        </div>

        {/* Pill tabs with sliding indicator */}
        <nav aria-label="Feature views" className="order-3 w-full sm:order-none sm:w-auto">
          <div
            className="flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm"
            role="tablist"
            aria-orientation="horizontal"
          >
            {VIEWS.map((view) => {
              const Icon = view.icon;
              const isActive = activeView === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`view-panel-${view.id}`}
                  id={`view-tab-${view.id}`}
                  onClick={() => navigateToView(view.id)}
                  className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition sm:px-4 ${
                    isActive ? 'text-white' : 'text-slate-600 hover:text-ember'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="view-pill-indicator"
                      className={`absolute inset-0 rounded-full bg-gradient-to-r ${view.accent} shadow`}
                      transition={reduceMotionEnabled ? { duration: 0 } : { type: 'spring', bounce: 0.25, duration: 0.5 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Icon size={15} />
                    {view.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex items-center gap-2">
          <button
            className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-600 transition hover:border-ember hover:text-ember"
            onClick={() => setIsAccessibilityOpen(true)}
            aria-label="Open accessibility options"
          >
            <Accessibility size={17} />
          </button>
          <button className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-600 transition hover:border-ember hover:text-ember" aria-label="Notifications">
            <Bell size={17} />
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

      {/* ── Body: rail + swipeable deck ───────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Left icon rail (macOS style, wide screens) */}
        <nav
          aria-label="Feature rail"
          className={`z-10 hidden w-16 shrink-0 flex-col items-center gap-2 border-r py-4 backdrop-blur-xl lg:flex ${
            highContrast ? 'border-slate-700 bg-slate-900/90' : 'border-white/70 bg-white/60'
          }`}
        >
          {VIEWS.map((view) => {
            const Icon = view.icon;
            const isActive = activeView === view.id;
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => navigateToView(view.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={`${view.label} — ${view.description}`}
                title={`${view.label} — ${view.description}`}
                className={`group relative flex h-11 w-11 items-center justify-center rounded-2xl transition ${
                  isActive
                    ? `bg-gradient-to-br ${view.accent} text-white shadow-lg`
                    : highContrast
                      ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      : 'text-slate-500 hover:bg-white hover:text-ember hover:shadow-sm'
                }`}
              >
                <Icon size={19} />
                <span
                  className={`pointer-events-none absolute left-full z-30 ml-2 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium opacity-0 shadow-lg transition group-hover:opacity-100 ${
                    highContrast ? 'bg-slate-800 text-slate-100' : 'bg-slate-900 text-white'
                  }`}
                >
                  {view.label}
                </span>
              </button>
            );
          })}
          <div className={`mt-auto rounded-xl p-2 ${highContrast ? 'text-slate-400' : 'text-slate-300'}`}>
            <Layers3 size={16} />
          </div>
        </nav>

        {/* Swipeable view deck — all views stay mounted so state persists */}
        <main className="min-w-0 flex-1 overflow-hidden px-4 py-4 sm:px-6">
          <motion.div
            className="h-full"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.16}
            dragMomentum={false}
            onDragEnd={(event, info) => {
              const threshold = 90;
              if (info.offset.x < -threshold) shiftView(1);
              else if (info.offset.x > threshold) shiftView(-1);
            }}
          >
            <motion.div
              key={activeView}
              id={`view-panel-${activeView}`}
              role="tabpanel"
              aria-labelledby={`view-tab-${activeView}`}
              initial={reduceMotionEnabled ? { opacity: 1 } : { opacity: 0, x: swipeDirection >= 0 ? 120 : -120 }}
              animate={reduceMotionEnabled ? { opacity: 1 } : { opacity: 1, x: 0 }}
              transition={reduceMotionEnabled ? { duration: 0 } : { duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
              className="h-full overflow-y-auto pb-4 pr-1"
            >
              {activeView === 'home' && (
                <HomeView
                  accessibilitySettings={accessibilitySettings}
                  onNavigate={navigateToView}
                />
              )}
              {activeView === 'generate' && (
                <GeneratorView
                  accessibilitySettings={accessibilitySettings}
                  form={generatorForm}
                  activeRecipe={activeRecipe}
                  saveSuccess={saveSuccess}
                  isGenerating={isGenerating}
                  genError={genError}
                  ingredientActionTarget={ingredientActionTarget}
                  setIngredientActionTarget={setIngredientActionTarget}
                  onGenerateRecipe={handleGenerateRecipe}
                  onDismissGenError={() => setGenError('')}
                  onModifyRecipe={handleModifyRecipe}
                  onSaveRecipe={handleSaveRecipe}
                  onOpenDetail={() => { setDetailRecipe(activeRecipe); setIsRecipeDetailOpen(true); }}
                  onSendChat={() => navigateToView('chat')}
                />
              )}
              {activeView === 'saved' && (
                <SavedView
                  savedRecipes={savedRecipes}
                  accessibilitySettings={accessibilitySettings}
                  onOpenRecipe={handleOpenRecipeDetail}
                  onDeleteSaved={handleDeleteSaved}
                  onToggleFavorite={handleToggleFavorite}
                  onNavigate={navigateToView}
                />
              )}
              {activeView === 'chat' && (
                <ChatView
                  messages={messages}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  isChatLoading={isChatLoading}
                  chatError={chatError}
                  activeRecipe={activeRecipe}
                  chatBottomRef={chatBottomRef}
                  onSendMessage={handleSendMessage}
                  onNavigate={navigateToView}
                  accessibilitySettings={accessibilitySettings}
                />
              )}
            </motion.div>
          </motion.div>
        </main>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MODALS
      ════════════════════════════════════════════════════════════════════ */}

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
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[30px] border border-white/70 bg-white shadow-2xl"
            >
              {/* Header */}
              <div className="sticky top-0 flex items-center justify-between rounded-t-[30px] border-b border-slate-100 bg-white/90 px-6 py-4 backdrop-blur-sm">
                <div>
                  {detailRecipe.tag && (
                    <span className="rounded-full bg-ember/10 px-3 py-1 text-xs font-medium text-ember">{detailRecipe.tag}</span>
                  )}
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">{detailRecipe.title}</h2>
                </div>
                <button
                  onClick={() => setIsRecipeDetailOpen(false)}
                  className="rounded-full border border-slate-200 p-2 text-slate-600 transition hover:border-ember hover:text-ember"
                  aria-label="Close recipe detail"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-6 p-6">
                {/* Meta */}
                <div className="flex flex-wrap gap-2 text-sm">
                  {detailRecipe.time && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{detailRecipe.time}</span>}
                  {detailRecipe.difficulty && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{detailRecipe.difficulty}</span>}
                  {detailRecipe.servings && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Serves {detailRecipe.servings}</span>}
                  {detailRecipe.cuisine && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{detailRecipe.cuisine}</span>}
                </div>

                <p className="leading-7 text-slate-600">{detailRecipe.description}</p>

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
                          <BadgeCheck size={14} className="shrink-0 text-ember" />
                          {typeof ing === 'object' ? `${ing.amount} ${ing.name}` : ing}
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
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ember/10 text-xs font-bold text-ember">{i + 1}</span>
                          <p className="text-sm leading-6 text-slate-700">{step}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Tips */}
                {detailRecipe.tips && (
                  <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/60 p-4">
                    <h3 className="flex items-center gap-2 font-semibold text-emerald-800"><TimerReset size={16} /> Chef tips</h3>
                    <p className="mt-2 text-sm leading-6 text-emerald-700">{detailRecipe.tips}</p>
                  </div>
                )}

                {/* Substitutions */}
                {detailRecipe.substitutions?.length > 0 && (
                  <div>
                    <h3 className="mb-2 font-semibold text-slate-900">Substitutions</h3>
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
                    className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium text-white transition ${saveSuccess ? 'bg-emerald-600' : 'bg-slate-900 hover:bg-slate-700'}`}
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
                <button type="submit" className="w-full rounded-full bg-ember px-4 py-2.5 font-medium text-white shadow shadow-ember/30 transition hover:bg-ember/90">
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
              {accessibilityOptionLabels.map((option) => (
                <label key={option.key} className="flex cursor-pointer items-center justify-between rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 transition hover:border-ember/30">
                  <span>{option.label}</span>
                  <input
                    type="checkbox"
                    aria-label={option.label}
                    checked={accessibilitySettings[option.key]}
                    onChange={() => toggleAccessibilitySetting(option.key)}
                    className="h-4 w-4 rounded border-slate-300 text-ember focus:ring-ember"
                  />
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
