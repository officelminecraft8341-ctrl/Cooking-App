import { useMemo, useState } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, X, UtensilsCrossed,
  Sun, Coffee, Moon, Cookie, Search,
} from 'lucide-react';

// ─── Date helpers (local-timezone safe) ──────────────────────────────────────
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(iso, n) {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + n);
  return toISODate(date);
}
function startOfWeek(iso) {
  const date = fromISODate(iso);
  const day = date.getDay(); // 0 = Sunday
  date.setDate(date.getDate() - day);
  return toISODate(date);
}
const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const SHORT_DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const SHORT_DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

const SLOTS = [
  { id: 'breakfast', label: 'Breakfast', icon: Coffee },
  { id: 'lunch', label: 'Lunch', icon: Sun },
  { id: 'dinner', label: 'Dinner', icon: Moon },
  { id: 'snack', label: 'Snack', icon: Cookie },
];

export default function CalendarView({
  savedRecipes = [],
  plan = {},
  onChangePlan,
  onOpenRecipe,
  onNavigate,
  accessibilitySettings,
  announce,
}) {
  const [mode, setMode] = useState('month'); // 'month' | 'week' | 'day'
  const [cursor, setCursor] = useState(() => toISODate(new Date()));
  const [picker, setPicker] = useState(null); // { date, slot }
  const [pickerQuery, setPickerQuery] = useState('');

  const today = toISODate(new Date());

  const monthGrid = useMemo(() => {
    const first = fromISODate(cursor);
    first.setDate(1);
    const start = startOfWeek(toISODate(first));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)),
    [cursor],
  );

  const shift = (delta) => {
    if (mode === 'month') {
      const date = fromISODate(cursor);
      date.setDate(1);
      date.setMonth(date.getMonth() + delta);
      setCursor(toISODate(date));
    } else if (mode === 'week') {
      setCursor(addDays(cursor, delta * 7));
    } else {
      setCursor(addDays(cursor, delta));
    }
  };

  const heading = useMemo(() => {
    if (mode === 'month') return MONTH_FORMAT.format(fromISODate(cursor));
    if (mode === 'week') {
      const start = fromISODate(startOfWeek(cursor));
      const end = fromISODate(addDays(startOfWeek(cursor), 6));
      return `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`;
    }
    return DAY_FORMAT.format(fromISODate(cursor));
  }, [mode, cursor]);

  const openPicker = (date, slot) => {
    setPicker({ date, slot });
    setPickerQuery('');
  };

  const matchingRecipes = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return savedRecipes;
    return savedRecipes.filter((r) => String(r?.title || '').toLowerCase().includes(q));
  }, [savedRecipes, pickerQuery]);

  const assignRecipe = (recipe) => {
    if (!picker || !recipe?.title) return;
    const key = `${picker.date}|${picker.slot}`;
    onChangePlan?.(picker.date, picker.slot, recipe);
    announce?.(`Planned ${recipe.title} for ${picker.slot} on ${picker.date}.`);
    setPicker(null);
    return key;
  };

  const removeEntry = (date, slot) => {
    onChangePlan?.(date, slot, null);
    announce?.(`Removed the ${slot} plan for ${date}.`);
  };

  const plannedCount = useMemo(
    () => Object.values(plan || {}).filter(Boolean).length,
    [plan],
  );

  // Count of planned meals per day (month view badges)
  const countsByDay = useMemo(() => {
    const counts = {};
    for (const key of Object.keys(plan || {})) {
      const [date, slot] = key.split('|');
      if (plan[key]) counts[date] = counts[date] || { total: 0, dinner: false };
      counts[date].total += 1;
      if (slot === 'dinner') counts[date].dinner = true;
    }
    return counts;
  }, [plan]);

  const DayCell = ({ iso, compact }) => {
    const inMonth = !compact || fromISODate(iso).getMonth() === fromISODate(cursor).getMonth();
    const dayCounts = countsByDay[iso];
    return (
      <div
        className={`flex min-h-[92px] flex-col rounded-[18px] border p-2 transition ${
          iso === today
            ? 'border-ember/60 bg-ember/5'
            : 'border-slate-200 bg-white/70'
        } ${compact && !inMonth ? 'opacity-40' : ''}`}
      >
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold ${iso === today ? 'text-ember' : 'text-slate-500'}`}>
            {SHORT_DATE.format(fromISODate(iso))}
          </span>
          {dayCounts?.total > 0 && (
            <span className="rounded-full bg-accent-strong/15 px-1.5 text-[10px] font-bold text-accent-strong">
              {dayCounts.total}
            </span>
          )}
        </div>
        <div className="mt-1 flex-1 space-y-1 overflow-hidden">
          {SLOTS.slice(0, compact ? 2 : 4).map(({ id, label, icon: SlotIcon }) => {
            const entry = plan?.[`${iso}|${id}`];
            return (
              <div key={id}>
                {entry ? (
                  <div className="group flex items-center gap-1 rounded-[10px] bg-gradient-to-r from-ember/15 to-ember/5 px-1.5 py-1 text-[11px] font-medium text-slate-700">
                    <SlotIcon size={11} className="shrink-0 text-ember" />
                    <button
                      type="button"
                      onClick={() => entry.recipeId && onOpenRecipe?.(entry.recipeId)}
                      className="min-w-0 flex-1 truncate text-left hover:underline"
                      title={`Open ${entry.title}`}
                    >
                      {entry.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeEntry(iso, id)}
                      className="shrink-0 rounded-full p-0.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
                      aria-label={`Remove ${entry.title} from ${label} on ${iso}`}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  !compact && (
                    <button
                      type="button"
                      onClick={() => openPicker(iso, id)}
                      className="flex w-full items-center gap-1 rounded-[10px] border border-dashed border-slate-200 px-1.5 py-1 text-[11px] text-slate-400 transition hover:border-ember/50 hover:text-ember"
                      aria-label={`Plan ${label} for ${iso}`}
                    >
                      <Plus size={11} /> {label}
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
        {compact && dayCounts?.total > 2 && (
          <button
            type="button"
            onClick={() => { setMode('day'); setCursor(iso); }}
            className="mt-1 text-left text-[10px] font-medium text-ember hover:underline"
          >
            +{dayCounts.total - 2} more
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 overflow-y-auto pb-4">
      {/* Header */}
      <section className="liquid-glass rounded-[28px] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-ember p-2.5 text-white shadow-lg shadow-ember/30">
              <CalendarDays size={20} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Meal planner</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{heading}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm" role="group" aria-label="Calendar mode">
              {['month', 'week', 'day'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition ${
                    mode === m ? 'bg-accent-strong text-white shadow' : 'text-slate-600 hover:text-ember'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-600 transition hover:border-ember hover:text-ember"
            aria-label={`Previous ${mode}`}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>{plannedCount} meal{plannedCount === 1 ? '' : 's'} planned</span>
            <button
              type="button"
              onClick={() => setCursor(today)}
              className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-ember hover:text-ember"
            >
              Today
            </button>
          </div>
          <button
            type="button"
            onClick={() => shift(1)}
            className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-600 transition hover:border-ember hover:text-ember"
            aria-label={`Next ${mode}`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </section>

      {/* Month grid */}
      {mode === 'month' && (
        <section className="liquid-glass rounded-[28px] p-4">
          <div className="grid grid-cols-7 gap-1.5 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {weekDays.map((iso) => <span key={iso}>{SHORT_DAY.format(fromISODate(iso))}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {monthGrid.map((iso) => <DayCell key={iso} iso={iso} compact />)}
          </div>
        </section>
      )}

      {/* Week strip */}
      {mode === 'week' && (
        <section className="liquid-glass rounded-[28px] p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {weekDays.map((iso) => <DayCell key={iso} iso={iso} />)}
          </div>
        </section>
      )}

      {/* Day detail */}
      {mode === 'day' && (
        <section className="liquid-glass rounded-[28px] p-5">
          <div className="space-y-3">
            {SLOTS.map(({ id, label, icon: SlotIcon }) => {
              const entry = plan?.[`${cursor}|${id}`];
              return (
                <div
                  key={id}
                  className={`flex items-center gap-3 rounded-[20px] border p-4 ${
                    entry ? 'border-ember/40 bg-ember/5' : 'border-slate-200 bg-white/70'
                  }`}
                >
                  <div className={`rounded-2xl p-2.5 ${entry ? 'bg-ember text-white' : 'bg-slate-100 text-slate-400'}`}>
                    <SlotIcon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                    {entry ? (
                      <button
                        type="button"
                        onClick={() => entry.recipeId && onOpenRecipe?.(entry.recipeId)}
                        className="truncate text-left text-sm font-semibold text-slate-800 hover:underline"
                      >
                        {entry.title}
                      </button>
                    ) : (
                      <p className="text-sm text-slate-400">Nothing planned</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openPicker(cursor, id)}
                    className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-600 transition hover:border-ember hover:text-ember"
                    aria-label={entry ? `Change ${label} for ${cursor}` : `Plan ${label} for ${cursor}`}
                  >
                    {entry ? <UtensilsCrossed size={15} /> : <Plus size={15} />}
                  </button>
                  {entry && (
                    <button
                      type="button"
                      onClick={() => removeEntry(cursor, id)}
                      className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-600 transition hover:border-red-300 hover:text-red-600"
                      aria-label={`Remove ${label} for ${cursor}`}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state */}
      {savedRecipes.length === 0 && (
        <section className="liquid-glass rounded-[28px] p-5 text-center">
          <CalendarDays className="mx-auto text-slate-300" size={28} />
          <h2 className="mt-2 font-semibold text-slate-800">Save a recipe to start planning</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            The planner builds meals from your saved recipes. Generate one, save it, and it will appear here.
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.('generate')}
            className="mt-3 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white shadow shadow-ember/30 transition hover:bg-ember/90"
          >
            Generate a recipe
          </button>
        </section>
      )}

      {/* Recipe picker modal */}
      {picker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm"
          onClick={() => setPicker(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Choose a recipe for ${picker.slot} on ${picker.date}`}
        >
          <div
            className="w-full max-w-md rounded-[30px] border border-white/70 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{DAY_FORMAT.format(fromISODate(picker.date))}</p>
                <h2 className="text-xl font-semibold text-slate-900 capitalize">{picker.slot}</h2>
              </div>
              <button type="button" onClick={() => setPicker(null)} className="rounded-full border border-slate-200 p-2 text-slate-600" aria-label="Close recipe picker">
                <X size={16} />
              </button>
            </div>
            <label className="mt-3 block">
              <span className="sr-only">Search saved recipes</span>
              <div className="flex items-center gap-2 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2">
                <Search size={15} className="text-slate-400" />
                <input
                  autoFocus
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder="Search your saved recipes…"
                  className="w-full bg-transparent text-sm outline-none"
                  aria-label="Search saved recipes"
                />
              </div>
            </label>
            <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
              {matchingRecipes.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  {savedRecipes.length === 0 ? 'No saved recipes yet — generate one first.' : 'No recipes match that search.'}
                </p>
              )}
              {matchingRecipes.map((recipe) => (
                <button
                  key={recipe.id ?? recipe.title}
                  type="button"
                  onClick={() => assignRecipe(recipe)}
                  className="flex w-full items-center gap-3 rounded-[16px] border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-ember/60"
                >
                  <UtensilsCrossed size={15} className="shrink-0 text-ember" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{recipe.title}</span>
                    {recipe.time && <span className="block text-xs text-slate-400">{recipe.time}</span>}
                  </span>
                  <Plus size={14} className="shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
