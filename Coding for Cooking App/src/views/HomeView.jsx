import { motion } from 'framer-motion';
import { Sparkles, Search, Microwave, Plus, BookOpen, ChefHat, ArrowRight, Heart } from 'lucide-react';

const quickTags = ['20 minutes', 'Vegetarian', 'High protein', 'No dairy', 'Italian'];

const launchpads = [
  {
    view: 'generate',
    icon: Plus,
    eyebrow: 'AI recipe studio',
    title: 'Generate a recipe',
    text: 'Turn pantry ingredients, cravings, and time limits into a real recipe with nutrition.',
    cta: 'Open the generator',
  },
  {
    view: 'saved',
    icon: Heart,
    eyebrow: 'Your collection',
    title: 'Saved recipes',
    text: 'Your personal kitchen library — favorites, go-to dinners, and everything ChefAI helped you make.',
    cta: 'Open my recipes',
  },
  {
    view: 'chat',
    icon: ChefHat,
    eyebrow: 'ChefAI chat',
    title: 'Ask the chef',
    text: 'Chat about substitutions, timing, technique, or what to cook tonight.',
    cta: 'Open chat',
  },
];

export default function HomeView({ accessibilitySettings, onNavigate }) {
  const reduceMotion = accessibilitySettings.reduceMotion;
  const highContrast = accessibilitySettings.highContrast;
  const dyslexiaStyle = accessibilitySettings.dyslexiaFont
    ? { fontFamily: 'Atkinson Hyperlegible, "Comic Sans MS", "Segoe UI", sans-serif' }
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <section
        className={`rounded-[28px] border border-white/70 bg-white/70 p-6 shadow-soft backdrop-blur-xl sm:p-8 ${highContrast ? 'border-slate-700 bg-slate-900' : ''}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-ember/10 px-3 py-1 text-sm font-medium text-ember">
              <Sparkles size={16} /> AI-powered culinary guidance
            </p>
            <h1
              className={`text-3xl font-semibold tracking-tight sm:text-4xl ${highContrast ? 'text-white' : 'text-slate-900'}`}
              style={dyslexiaStyle}
            >
              Cook beautifully, plan effortlessly.
            </h1>
            <p
              className={`mt-3 text-base sm:text-lg ${highContrast ? 'text-slate-200' : 'text-slate-600'}`}
              style={dyslexiaStyle}
            >
              ChefAI turns pantry ingredients, preferences, and time constraints into inspiring recipes — with real
              nutrition, real instructions, and real cooking guidance.
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full bg-ember px-4 py-2.5 font-medium text-white shadow-lg shadow-ember/30 transition hover:translate-y-[-1px] hover:shadow-ember/40"
            onClick={() => onNavigate('generate')}
            id="open-recipe-generator"
          >
            <Plus size={18} /> Create a recipe
          </button>
        </div>

        {/* ── Quick input bar ────────────────────────────────────────────── */}
        <div
          className={`mt-7 rounded-[26px] border border-slate-200/80 p-5 text-white shadow-2xl ${highContrast ? 'bg-slate-800' : 'bg-slate-950/95'}`}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onNavigate('generate');
            }}
            className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/10 px-4 py-3 text-sm text-slate-300"
            style={dyslexiaStyle}
          >
            <Search size={16} />
            <input
              type="text"
              placeholder="I have chicken, garlic, and lemon — make something Italian…"
              aria-label="Quick recipe idea"
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
              onFocus={() => onNavigate('generate')}
            />
          </form>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Try asking</p>
              <p className="mt-2 text-lg font-semibold">What can I make with eggs, cheese, and spinach?</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3">
              <Microwave size={20} />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-300">
            {quickTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onNavigate('generate')}
                className="rounded-full border border-white/10 bg-white/10 px-3 py-1 transition hover:bg-white/20"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* ── Feature launchpads ─────────────────────────────────────────── */}
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {launchpads.map((item) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={item.view}
                type="button"
                whileHover={reduceMotion ? undefined : { y: -4, scale: 1.01 }}
                transition={reduceMotion ? { duration: 0 } : undefined}
                onClick={() => onNavigate(item.view)}
                className={`rounded-[22px] border p-5 text-left transition ${
                  highContrast
                    ? 'border-slate-600 bg-slate-800 text-slate-50'
                    : 'border-slate-200/80 bg-slate-50/80 hover:border-ember/40'
                }`}
              >
                <div className="mb-3 inline-flex rounded-2xl bg-white p-2 text-ember shadow-sm">
                  <Icon size={18} />
                </div>
                <p className={`text-xs font-medium uppercase tracking-wider ${highContrast ? 'text-slate-300' : 'text-slate-400'}`}>
                  {item.eyebrow}
                </p>
                <h2 className={`mt-1 font-semibold ${highContrast ? 'text-white' : 'text-slate-900'}`}>{item.title}</h2>
                <p className={`mt-2 text-sm leading-6 ${highContrast ? 'text-slate-300' : 'text-slate-600'}`}>{item.text}</p>
                <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-ember">
                  {item.cta} <ArrowRight size={14} />
                </p>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* ── Cooking mode teaser ──────────────────────────────────────────── */}
      <section
        className={`rounded-[28px] border p-5 shadow-soft ${
          highContrast
            ? 'border-slate-600 bg-slate-800'
            : 'border-white/70 bg-gradient-to-br from-ember/10 via-white to-emerald/10'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-ember">
            <BookOpen size={18} />
            <p className="font-semibold">Cooking mode</p>
          </div>
          <p className={`max-w-xl text-sm leading-6 ${highContrast ? 'text-slate-200' : 'text-slate-600'}`}>
            Full-screen guidance with step-by-step progress, voice-ready controls, timers, and ingredient checklists.
            Open any saved recipe and hit Full view to cook along.
          </p>
        </div>
      </section>
    </div>
  );
}
