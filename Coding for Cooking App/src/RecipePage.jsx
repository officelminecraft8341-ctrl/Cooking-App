import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock3, Flame, Sparkles, TimerReset, BookOpen, BadgeCheck, Heart, Layers3 } from 'lucide-react';

const recipeMap = {
  'golden-tomato-pasta': {
    title: 'Golden Tomato Pasta',
    description: 'Creamy, bright, and protein-forward in under 20 minutes.',
    time: '20 min',
    difficulty: 'Easy',
    tag: 'High Protein',
    ingredients: ['Pasta', 'Cherry tomatoes', 'Parmesan', 'Spinach', 'Garlic', 'Olive oil'],
    instructions: ['Sear garlic and tomatoes until jammy.', 'Toss in pasta water and Parmesan.', 'Fold through spinach and finish with pepper.'],
  },
  'crispy-herb-salmon': {
    title: 'Crispy Herb Salmon',
    description: 'Sheet-pan salmon with lemon, dill, and crisp greens.',
    time: '25 min',
    difficulty: 'Medium',
    tag: 'Omega-3',
    ingredients: ['Salmon fillet', 'Lemon', 'Dill', 'Green beans', 'Olive oil'],
    instructions: ['Season salmon and roast until crisp.', 'Toss greens and beans in oil and herbs.', 'Serve with lemon and flaky salt.'],
  },
  'velvet-mushroom-risotto': {
    title: 'Velvet Mushroom Risotto',
    description: 'Silky arborio rice with roasted mushrooms and thyme.',
    time: '35 min',
    difficulty: 'Medium',
    tag: 'Comfort',
    ingredients: ['Arborio rice', 'Mushrooms', 'Stock', 'Parmesan', 'Thyme'],
    instructions: ['Toast rice and soften mushrooms.', 'Add stock gradually until creamy.', 'Finish with cheese and thyme.'],
  },
};

export default function RecipePage() {
  const { recipeName } = useParams();
  const [activeStep, setActiveStep] = useState(0);
  const recipe = useMemo(() => recipeMap[recipeName] || recipeMap['golden-tomato-pasta'], [recipeName]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,122,24,0.16),_transparent_30%),linear-gradient(135deg,#fffdf9_0%,#f8fafc_100%)] px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex items-center justify-between rounded-[28px] border border-white/70 bg-white/70 px-5 py-4 shadow-soft backdrop-blur-xl">
          <Link to="/" className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <ArrowLeft size={16} /> Back home
          </Link>
          <div className="rounded-full bg-ember/10 px-3 py-1 text-sm font-medium text-ember">{recipe.tag}</div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[32px] border border-white/70 bg-white/70 p-6 shadow-soft backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1">{recipe.time}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1">{recipe.difficulty}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1">ChefAI recommended</span>
            </div>
            <h1 className="mt-4 text-4xl font-semibold text-slate-900">{recipe.title}</h1>
            <p className="mt-3 text-lg leading-7 text-slate-600">{recipe.description}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Protein', value: '32g', icon: Flame },
                { label: 'Time', value: recipe.time, icon: Clock3 },
                { label: 'AI score', value: '9.2/10', icon: Sparkles },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-ember">
                      <Icon size={16} />
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[32px] border border-white/70 bg-slate-950/95 p-6 text-white shadow-soft">
            <div className="flex items-center gap-2">
              <BookOpen size={18} />
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Cooking mode</p>
            </div>
            <h2 className="mt-3 text-2xl font-semibold">Focused flow</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">A calm, full-screen cooking experience with timers, steps, and momentum.</p>
            <div className="mt-6 space-y-3">
              {recipe.instructions.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={`w-full rounded-[20px] border px-4 py-3 text-left text-sm ${activeStep === index ? 'border-ember bg-ember/20 text-white' : 'border-white/10 bg-white/10 text-slate-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <BadgeCheck size={16} />
                    <span>Step {index + 1}</span>
                  </div>
                  <p className="mt-2 text-sm">{step}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-[32px] border border-white/70 bg-white/70 p-6 shadow-soft backdrop-blur-xl">
            <div className="flex items-center gap-2 text-ember">
              <Layers3 size={18} />
              <h2 className="text-xl font-semibold text-slate-900">Ingredients</h2>
            </div>
            <ul className="mt-4 space-y-3">
              {recipe.ingredients.map((ingredient) => (
                <li key={ingredient} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {ingredient}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[32px] border border-white/70 bg-gradient-to-br from-ember/10 via-white to-emerald/10 p-6 shadow-soft backdrop-blur-xl">
            <div className="flex items-center gap-2 text-ember">
              <Heart size={18} />
              <h2 className="text-xl font-semibold text-slate-900">Helpful notes</h2>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Use olive oil instead of butter for a lighter finish, stir in extra greens to increase fiber, and keep the sauce glossy by not over-reducing it.
            </p>
            <div className="mt-6 rounded-[24px] border border-slate-200 bg-white/80 p-4">
              <div className="flex items-center gap-2 text-slate-700">
                <TimerReset size={16} />
                <span className="text-sm font-medium">Suggested timer</span>
              </div>
              <p className="mt-2 text-lg font-semibold text-slate-900">8 min simmer • 5 min prep</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
