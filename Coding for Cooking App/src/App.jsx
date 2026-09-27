import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest, authSignUp, authLogin, authLogout, authMe, auth2faSetup, auth2faEnable, auth2faDisable, auth2faStatus, fetchPrefs, pushPrefs, markSignedIn, markSignedOut, oauthStatus, oauthStartUrl, oauthUnlink } from './apiClient';
import { passwordStrength, passwordProblems } from '../shared/authShared.js';
import {
  ChefHat, Accessibility, Bell, X, Sparkles, BookOpen, Bot,
  Plus, Heart, Layers3, BadgeCheck, TimerReset, Flame, BookmarkPlus,
  Palette, Check, Move, ArrowRight, Video, Newspaper, LogOut, UserRound, Loader2, Trash2, ShieldCheck, CalendarDays, Star,
} from 'lucide-react';
import LegalDocs from './LegalDocs';
import { ConsentBanner, ConsentCheckbox, readStoredConsent } from './Consent';

// AI-generated nutrition values are estimates — shown wherever nutrition renders
import HomeView from './views/HomeView';
import GeneratorView from './views/GeneratorView';
import SavedView from './views/SavedView';
import CalendarView from './views/CalendarView';
import ChatView from './views/ChatView';

const ACCESSIBILITY_STORAGE_KEY = 'chefai-accessibility-settings';
const APPEARANCE_STORAGE_KEY = 'chefai-appearance-settings';

// BLACK, WHITE, GREY, BLUE, YELLOW, ORANGE, AZUL
const ACCENT_THEMES = [
  { id: 'black', label: 'Black', swatch: '#18181b' },
  { id: 'white', label: 'White', swatch: '#ffffff' },
  { id: 'grey', label: 'Grey', swatch: '#64748b' },
  { id: 'blue', label: 'Blue', swatch: '#2563eb' },
  { id: 'yellow', label: 'Yellow', swatch: '#eab308' },
  { id: 'orange', label: 'Orange', swatch: '#ff7a18' },
  { id: 'azul', label: 'Azul', swatch: '#0d94c5' },
];

const defaultAppearance = { accent: 'orange', liquidGlass: true };

const defaultAccessibilitySettings = {
  highContrast: false,
  largeText: false,
  dyslexiaFont: false,
  reduceMotion: false,
  voiceGuidance: false,
};

const accessibilityOptionLabels = [
  { key: 'highContrast', label: 'High contrast', description: 'Pure black & white, no glass or translucency, strong outlines on every control.' },
  { key: 'largeText', label: 'Large text', description: 'Scales all text, spacing, and controls up 15%.' },
  { key: 'dyslexiaFont', label: 'Dyslexia-friendly font', description: 'Atkinson Hyperlegible with wider letter & word spacing.' },
  { key: 'reduceMotion', label: 'Reduce motion', description: 'Disables animations, transitions, and sliding view changes.' },
  { key: 'voiceGuidance', label: 'Voice guidance', description: 'Reads view changes, saves, and errors aloud.' },
];

// Maps a Generate meal-type to the Calendar slot it lands in when the user
// opts into “Add to calendar”.
const MEAL_TYPE_SLOT = { breakfast: 'breakfast', lunch: 'lunch', snack: 'snack', dinner: 'dinner', extra: 'snack' };

function todayISODate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Inline brand marks (no third-party icon packages, keeps CSP tight).
function GoogleG(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.03c2.2-2.05 3.5-5.06 3.5-8.58z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.78-2.93c-1.02.71-2.39 1.2-4.16 1.2-3.2 0-5.92-2.11-6.89-5.02l-.14.01-3.5 2.72-.05.13C3.39 21.3 7.37 24 12 24z" />
      <path fill="#FBBC05" d="M5.11 14.34A6.9 6.9 0 0 1 4.74 12c0-.81.14-1.6.36-2.34l-.01-.16-3.54-2.75-.12.06A11.96 11.96 0 0 0 0 12c0 1.93.46 3.76 1.43 5.19l3.68-2.85z" />
      <path fill="#EB4335" d="M12 4.64c2.28 0 3.82.98 4.7 1.8l3.43-3.35C17.95 1.03 15.24 0 12 0 7.37 0 3.39 2.7 1.43 6.81l3.68 2.85C6.08 6.75 8.8 4.64 12 4.64z" />
    </svg>
  );
}

function AppleMark(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M17.05 12.54c-.03-2.89 2.36-4.27 2.47-4.34-1.35-1.97-3.44-2.24-4.18-2.27-1.78-.18-3.47 1.05-4.37 1.05-.9 0-2.29-1.02-3.77-1-1.94.03-3.72 1.13-4.72 2.86-2.01 3.49-.51 8.66 1.45 11.5.96 1.39 2.1 2.95 3.6 2.89 1.45-.06 1.99-.93 3.74-.93s2.24.93 3.77.9c1.56-.03 2.54-1.41 3.49-2.81 1.1-1.61 1.55-3.17 1.58-3.25-.04-.02-3.02-1.16-3.06-4.6zM14.16 4.06c.8-.97 1.34-2.32 1.19-3.66-1.15.05-2.55.77-3.38 1.74-.74.85-1.39 2.23-1.22 3.54 1.29.1 2.6-.65 3.41-1.62z" />
    </svg>
  );
}

const MEAL_TYPE_OPTIONS = [
  { value: '', label: 'Any meal', icon: null },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'snack', label: 'Snack' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'extra', label: 'Desserts & extras' },
];

// ─── View definitions ────────────────────────────────────────────────────────

const VIEWS = [
  {
    id: 'home',
    label: 'Home',
    icon: Sparkles,
    accent: 'bg-accent-strong',
    description: 'Welcome and quick start',
  },
  {
    id: 'generate',
    label: 'Generate',
    icon: Plus,
    accent: 'bg-ember',
    description: 'AI recipe studio',
  },
  {
    id: 'saved',
    label: 'Saved',
    icon: Heart,
    accent: 'bg-accent-strong',
    description: 'Your recipe collection',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: CalendarDays,
    accent: 'bg-accent-strong',
    description: 'Plan meals for the month',
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: Bot,
    accent: 'bg-ember',
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
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [autoSaveNotice, setAutoSaveNotice] = useState('');
  const [isWindowDragArmed, setIsWindowDragArmed] = useState(false);

  // Auth — real accounts via /api/auth/*, session persisted in an httpOnly
  // cookie (never in JS-readable storage). 2FA + captcha state lives here too.
  const [authUser, setAuthUser] = useState(null);
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup'
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupConsent, setSignupConsent] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [ageYears, setAgeYears] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingChallenge, setPendingChallenge] = useState(null); // { challenge }
  const [captcha, setCaptcha] = useState(null); // { id, question }
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  // OAuth: which providers the SERVER has configured + which are linked to the
  // signed-in account. Hidden entirely until env keys exist.
  const [oauthProviders, setOauthProviders] = useState({ google: false, apple: false });
  const [oauthLinked, setOauthLinked] = useState({ google: false, apple: false });
  const [twoFactorSetup, setTwoFactorSetup] = useState(null); // { secret, otpauth }
  const [twoFactorEnableCode, setTwoFactorEnableCode] = useState('');
  const [twoFactorBackupCodes, setTwoFactorBackupCodes] = useState(null);
  const [twoFactorDisablePassword, setTwoFactorDisablePassword] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');

  // Legal + consent
  const [activeDoc, setActiveDoc] = useState(null); // null | 'privacy' | 'terms' | 'cookies' | 'refund'
  const [consent, setConsent] = useState(() => readStoredConsent());

  // Recipes
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [savedRecipes, setSavedRecipes] = useState([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [detailRecipe, setDetailRecipe] = useState(null);
  const [ingredientActionTarget, setIngredientActionTarget] = useState(null);

  // Recipe generator form
  const [genIngredients, setGenIngredients] = useState('');
  const [genImage, setGenImage] = useState(null); // data URL — photo of a dish to auto-find
  const [isFindingFromImage, setIsFindingFromImage] = useState(false);
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
  const [genMealType, setGenMealType] = useState(''); // '' | breakfast | lunch | snack | dinner | extra
  // Optional calendar drop: when set, a generated recipe is planned here.
  const [genPlanDate, setGenPlanDate] = useState('');
  const [customAccessibilityInput, setCustomAccessibilityInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [recipeIdeas, setRecipeIdeas] = useState(null);
  // Brainstorms the user starred — saved as idea cards, convertible later.
  const [savedIdeas, setSavedIdeas] = useState([]);
  const [pendingGenRequest, setPendingGenRequest] = useState(null);
  const [isSelectingIdea, setIsSelectingIdea] = useState(false);

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

  // Voice guidance + screen-reader announcements: every meaningful change is
  // pushed to a polite aria-live region AND spoken aloud when voiceGuidance is on.
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const liveSeq = useRef(0);
  const accessibilityRef = useRef(accessibilitySettings);
  accessibilityRef.current = accessibilitySettings;

  const announce = useCallback((text) => {
    liveSeq.current += 1;
    setLiveAnnouncement(`${text}`);
    if (accessibilityRef.current.voiceGuidance && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.05;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  // ── View sync for the active view ──────────────────────────────────────
  const navigateToView = useCallback((viewId) => {
    if (!isValidViewId(viewId)) return;
    setSwipeDirection(VIEW_IDS.indexOf(viewId) - VIEW_IDS.indexOf(activeView));
    setActiveView(viewId);
    setSearchParams(viewId === 'home' ? {} : { view: viewId }, { replace: false });
    const viewDef = VIEWS.find((view) => view.id === viewId);
    if (viewDef) announce(`${viewDef.label} view. ${viewDef.description}.`);
  }, [activeView, setSearchParams, announce]);

  useEffect(() => {
    if (requestedView && isValidViewId(requestedView) && requestedView !== activeView) {
      setSwipeDirection(VIEW_IDS.indexOf(requestedView) - VIEW_IDS.indexOf(activeView));
      setActiveView(requestedView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedView]);

  // ── OAuth: discover configured providers + consume a returning result ────
  const refreshOauthStatus = useCallback(() => {
    oauthStatus()
      .then((data) => {
        if (data?.providers) setOauthProviders({ google: Boolean(data.providers.google), apple: Boolean(data.providers.apple) });
        if (data?.linked) setOauthLinked({ google: Boolean(data.linked.google), apple: Boolean(data.linked.apple) });
      })
      .catch(() => { /* server unreachable — providers stay hidden */ });
  }, []);

  useEffect(() => {
    refreshOauthStatus();
  }, [refreshOauthStatus, authUser]);

  // Consume the OAuth result written by /oauth-result (same-tab or popup).
  useEffect(() => {
    const consume = () => {
      try {
        const raw = sessionStorage.getItem('chefai-oauth-result');
        if (!raw) return;
        sessionStorage.removeItem('chefai-oauth-result');
        const result = JSON.parse(raw);
        if (Date.now() - (result.at || 0) > 60_000) return; // stale
        if (result.success === '1') {
          // Cookie is set; refresh session state like a normal sign-in.
          authEpochRef.current += 1;
          authMe().then((user) => {
            setAuthUser(user);
            markSignedIn();
            setIsAuthOpen(false);
            announce(`Signed in with ${result.via || 'your account'} as ${user.name}.`);
            pullAccountData();
          }).catch(() => announce('Sign-in succeeded but the session could not be verified. Please try again.'));
        } else if (result.linked) {
          setOauthLinked((current) => ({ ...current, [result.linked]: true }));
          announce(`${result.linked === 'google' ? 'Google' : 'Apple'} account connected.`);
        } else if (result.error) {
          const friendly = {
            email_unverified: 'Your provider email is not verified — verify it and try again.',
            provider_linked_elsewhere: 'That provider account is already connected to a different ChefAI account.',
            invalid_state: 'Sign-in expired. Please try again.',
            session_expired: 'Your session expired while connecting — sign in and retry.',
          }[result.error] || 'Social sign-in failed. Please try again.';
          setAuthError(friendly);
          setIsAuthOpen(true);
          announce(friendly);
        }
      } catch { /* ignore malformed results */ }
    };
    consume();
    window.addEventListener('storage', consume);
    window.addEventListener('focus', consume);
    return () => {
      window.removeEventListener('storage', consume);
      window.removeEventListener('focus', consume);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setIsAnyModalOpen(isAccessibilityOpen || isAuthOpen || isRecipeDetailOpen || Boolean(recipeIdeas));
  }, [isAccessibilityOpen, isAuthOpen, isRecipeDetailOpen, recipeIdeas]);

  // Esc dismisses the ideas overlay
  useEffect(() => {
    if (!recipeIdeas) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') handleDismissIdeas();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeIdeas]);

  // ── Persist saved recipes to localStorage ─────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('chefai-saved-recipes');
    if (stored) {
      try { setSavedRecipes(JSON.parse(stored)); } catch { /* ignore */ }
    }
    const storedIdeas = localStorage.getItem('chefai-saved-ideas');
    if (storedIdeas) {
      try { setSavedIdeas(JSON.parse(storedIdeas)); } catch { /* ignore */ }
    }
  }, []);

  // Starred ideas ride the same account-sync channel as prefs (part of the
  // prefs payload, so they follow the user across devices for free).
  useEffect(() => {
    localStorage.setItem('chefai-saved-ideas', JSON.stringify(savedIdeas));
  }, [savedIdeas]);

  // Hydrate from the server too — localStorage can be lost, the store survives
  useEffect(() => {
    let cancelled = false;
    apiRequest('/recipes').then((recipes) => {
      if (cancelled || !Array.isArray(recipes)) return;
      setSavedRecipes((current) => {
        const byTitle = new Map(current.map((r) => [r.title, r]));
        recipes.forEach((r) => { if (r?.title && !byTitle.has(r.title)) byTitle.set(r.title, r); });
        return Array.from(byTitle.values());
      });
    }).catch(() => { /* offline — localStorage is the fallback */ });
    return () => { cancelled = true; };
  }, []);

  // Restore a signed-in session: the httpOnly cookie is the source of truth,
  // /auth/me decides whether it is still valid.
  // Bumped whenever the user signs in/out so a slow in-flight /auth/me from
  // mount time can never clobber a newer session state.
  const authEpochRef = useRef(0);
  // Cross-device sync: true once this session has pulled the account's
  // preferences, so local edits push instead of racing the initial pull.
  const prefsSyncReadyRef = useRef(false);
  const pushPrefsTimerRef = useRef(null);

  // Meal plan: keyed "YYYY-MM-DD|slot" → { title, recipeId }. Cached in
  // localStorage, synced to the account like prefs (debounced push on change,
  // pulled on sign-in) so the plan follows the user across devices.
  const [plan, setPlan] = useState(() => {
    try { return JSON.parse(localStorage.getItem('chefai-meal-plan')) || {}; } catch { return {}; }
  });
  const planSyncTimerRef = useRef(null);

  useEffect(() => {
    const epoch = authEpochRef.current;
    authMe()
      .then((user) => { if (epoch === authEpochRef.current) { setAuthUser(user); markSignedIn(); } })
      .catch(() => { if (epoch === authEpochRef.current) { setAuthUser(null); markSignedOut(); } });
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

  // ── Appearance (accent theme + liquid glass) ──────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.accent) setAppearance({ ...defaultAppearance, ...parsed });
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
    document.documentElement.setAttribute('data-accent', appearance.accent);
    document.body.classList.toggle('glass-off', !appearance.liquidGlass);
  }, [appearance]);

  // Push preference changes to the account (debounced) so the look & feel
  // follows the user to every device. localStorage stays as the signed-out
  // cache only — the account is the source of truth once signed in.
  useEffect(() => {
    if (!authUser || !prefsSyncReadyRef.current) return undefined;
    if (pushPrefsTimerRef.current) clearTimeout(pushPrefsTimerRef.current);
    pushPrefsTimerRef.current = setTimeout(() => {
      pushPrefs({ appearance, accessibility: accessibilitySettings, savedIdeas }).catch(() => { /* offline; next change retries */ });
    }, 1200);
    return () => { if (pushPrefsTimerRef.current) clearTimeout(pushPrefsTimerRef.current); };
  }, [authUser, appearance, accessibilitySettings, savedIdeas]);

  useEffect(() => {
    const root = document.body;
    root.classList.toggle('accessibility-high-contrast', accessibilitySettings.highContrast);
    root.classList.toggle('accessibility-large-text', accessibilitySettings.largeText);
    root.classList.toggle('accessibility-dyslexia-font', accessibilitySettings.dyslexiaFont);
    root.classList.toggle('accessibility-reduce-motion', accessibilitySettings.reduceMotion);

    // Font scale lives on <html> so every rem-based Tailwind size follows.
    document.documentElement.style.fontSize = accessibilitySettings.largeText ? '115%' : '';

    if (accessibilitySettings.voiceGuidance && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance('Voice guidance on. I will read out view changes, saves, and errors.');
      utterance.lang = 'en-US';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [accessibilitySettings]);

  useEffect(() => {
    localStorage.setItem('chefai-saved-recipes', JSON.stringify(savedRecipes));
  }, [savedRecipes]);

  // ── Meal plan: local cache + account sync ─────────────────────────────
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('chefai-meal-plan') || '{}');
      if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) setPlan(stored);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('chefai-meal-plan', JSON.stringify(plan));
    if (!authUser || !prefsSyncReadyRef.current) return undefined;
    if (planSyncTimerRef.current) clearTimeout(planSyncTimerRef.current);
    planSyncTimerRef.current = setTimeout(() => {
      pushPrefs({ plan }).catch(() => { /* offline; next change retries */ });
    }, 1200);
    return () => { if (planSyncTimerRef.current) clearTimeout(planSyncTimerRef.current); };
  }, [authUser, plan]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!autoSaveNotice) return undefined;
    const timer = setTimeout(() => setAutoSaveNotice(''), 2600);
    return () => clearTimeout(timer);
  }, [autoSaveNotice]);

  // Release the window drag handle when the pointer comes up anywhere
  useEffect(() => {
    if (!isWindowDragArmed) return undefined;
    const release = () => setIsWindowDragArmed(false);
    window.addEventListener('pointerup', release);
    return () => window.removeEventListener('pointerup', release);
  }, [isWindowDragArmed]);

  // Clicking outside the recipe window closes it (and auto-saves the draft)
  useEffect(() => {
    if (!isRecipeDetailOpen) return undefined;
    const handlePointerDown = (event) => {
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      handleCloseRecipeWindow();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecipeDetailOpen, detailRecipe, savedRecipes]);

  useEffect(() => {
    if (chatBottomRef.current && typeof chatBottomRef.current.scrollIntoView === 'function') {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── Recipe Generation (two-step: ideas → chosen recipe) ────────────────────
  const resetGeneratorForm = () => {
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
    setGenImage(null);
    setGenMealType('');
  };

  const buildGenRequest = () => {
    const finalCuisines = fusionModeActive
      ? [...genCuisines, ...customCuisines]
      : [genCuisines[0] === 'Custom' ? customCuisineInput : (genCuisines[0] || '')];
    const finalAccessibility = genAccessibility === 'Custom' ? customAccessibilityInput : genAccessibility;
    return {
      ingredients: genIngredients.split(',').map((s) => s.trim()).filter(Boolean),
      cuisines: finalCuisines.filter(Boolean),
      diet: genDiet,
      time: genTime,
      servings: parseInt(genServings, 10) || 2,
      difficulty: genDifficulty,
      strictMode: genStrictMode,
      accessibility: finalAccessibility,
      mealType: genMealType,
    };
  };

  const handleGenerateRecipe = async (event) => {
    event.preventDefault();
    const request = buildGenRequest();

    if (!request.ingredients.length && request.cuisines.filter(Boolean).length === 0 && !request.diet && !genImage) {
      setGenError('Please describe what you have, what you want to cook, or add a photo.');
      announce('Please describe what you have, what you want to cook, or add a photo.');
      return;
    }

    setIsGenerating(true);
    setGenError('');
    setRecipeIdeas(null);

    try {
      // Step 1: brainstorm 3 concepts across a complexity range
      const data = await apiRequest('/recipes/ideas', {
        method: 'POST',
        body: {
          ingredients: request.ingredients,
          cuisines: request.cuisines,
          diet: request.diet,
          time: request.time,
          servings: request.servings,
          mealType: request.mealType,
        },
      });

      if (!Array.isArray(data.ideas) || data.ideas.length === 0) {
        throw new Error(data.error || 'Failed to brainstorm ideas');
      }

      setPendingGenRequest(request);
      setRecipeIdeas(data.ideas); // full-window overlay shows via recipeIdeas
      announce(`${data.ideas.length} recipe ideas ready. Choose one to customize.`);
    } catch (error) {
      setGenError(error.message || 'Something went wrong. Please try again.');
      announce(error.message || 'Generating ideas failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Photo → auto-find: identify the dish in the picture and generate its recipe,
  // honoring whatever constraints (diet, time, servings…) are set on the form.
  const handleFindFromImage = async () => {
    if (!genImage || isFindingFromImage) return;
    setIsFindingFromImage(true);
    setGenError('');
    setRecipeIdeas(null);

    try {
      const request = buildGenRequest();
      const data = await apiRequest('/recipes/generate', {
        method: 'POST',
        body: { ...request, imageIngredients: { images: [genImage] } },
      });
      if (!data.recipe) throw new Error(data.error || 'Could not find a recipe from that photo');

      resetGeneratorForm();
      setActiveRecipe(data.recipe);
      setDetailRecipe(data.recipe);
      announce(`Recipe found from your photo: ${data.recipe.title}.`);
      setIsRecipeDetailOpen(true);
    } catch (error) {
      setGenError(error.message || 'Could not find a recipe from that photo. Try a clearer shot.');
      announce(error.message || 'Could not find a recipe from that photo.');
    } finally {
      setIsFindingFromImage(false);
    }
  };

  const handleSelectIdea = async (idea) => {
    if (!pendingGenRequest) return;
    setIsSelectingIdea(true);
    setGenError('');

    try {
      const data = await apiRequest('/recipes/generate', {
        method: 'POST',
        body: {
          ...pendingGenRequest,
          idea: { ideaId: idea.id, ideaTitle: idea.title, ideaComplexity: idea.complexity, ideaTwist: idea.keyTwist },
        },
      });

      if (!data.recipe) {
        throw new Error(data.error || 'Failed to generate recipe');
      }

      setRecipeIdeas(null);
      setPendingGenRequest(null);
      resetGeneratorForm();
      setActiveRecipe(data.recipe);
      setDetailRecipe(data.recipe);
      setIsRecipeDetailOpen(true); // Full-window recipe with tutorial links
      // Optional calendar hookup: plan the fresh recipe on the chosen day.
      if (genPlanDate) {
        const slot = MEAL_TYPE_SLOT[genMealType] || 'dinner';
        handleChangePlan(genPlanDate, slot, { title: data.recipe.title, id: null });
        announce(`Your recipe is ready: ${data.recipe.title}. Planned for ${slot} on ${genPlanDate}.`);
        setGenPlanDate('');
      } else {
        announce(`Your recipe is ready: ${data.recipe.title}.`);
      }
    } catch (error) {
      setGenError(error.message || 'Something went wrong. Please try again.');
      announce(error.message || 'Generating the recipe failed. Please try again.');
    } finally {
      setIsSelectingIdea(false);
    }
  };

  const handleDismissIdeas = () => {
    setRecipeIdeas(null);
    setPendingGenRequest(null);
  };

  // Star an idea card: keeps the brainstorm for later. In Saved, the user can
  // turn it into a full recipe with the original request preserved.
  const handleStarIdea = (idea) => {
    const entry = {
      id: `idea-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: idea.title,
      description: idea.description || '',
      complexity: idea.complexity || 'Intermediate',
      time: idea.time || '',
      keyTwist: idea.keyTwist || '',
      request: pendingGenRequest || null, // original form state for full generation
      savedAt: new Date().toISOString(),
    };
    setSavedIdeas((current) => current.some((i) => i.title === entry.title) ? current : [...current, entry]);
    announce(`Saved "${entry.title}" to your ideas. Find it in Saved to turn it into a full recipe.`);
  };

  // Saved → “Cook this idea”: regenerate from the stored brainstorm + request.
  const handleCookSavedIdea = async (savedIdea) => {
    if (isSelectingIdea) return;
    setIsSelectingIdea(true);
    setGenError('');
    try {
      const request = savedIdea.request || { ingredients: [], cuisines: [], diet: '', time: savedIdea.time || '', servings: 2, difficulty: 'Any', strictMode: false, accessibility: '' };
      const data = await apiRequest('/recipes/generate', {
        method: 'POST',
        body: {
          ...request,
          idea: { ideaId: 'saved', ideaTitle: savedIdea.title, ideaComplexity: savedIdea.complexity, ideaTwist: savedIdea.keyTwist },
        },
      });
      if (!data.recipe) throw new Error(data.error || 'Failed to generate recipe');
      // The idea has served its purpose — promote it to a real recipe.
      setSavedIdeas((current) => current.filter((i) => i.id !== savedIdea.id));
      setActiveRecipe(data.recipe);
      setDetailRecipe(data.recipe);
      setIsRecipeDetailOpen(true);
      announce(`Your recipe is ready: ${data.recipe.title}.`);
    } catch (error) {
      setGenError(error.message || 'Generating the recipe failed. Please try again.');
      announce(error.message || 'Generating the recipe failed. Please try again.');
      setIsRecipeDetailOpen(false);
      setDetailRecipe(null);
    } finally {
      setIsSelectingIdea(false);
    }
  };

  const handleDeleteSavedIdea = (ideaId) => {
    setSavedIdeas((current) => current.filter((i) => i.id !== ideaId));
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
      setDetailRecipe(data.recipe); // Keep the open floating window in sync
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

  // ── Recipe window: auto-save the draft when the user clicks out ──────
  // Dedupe via savedRecipes means already-saved recipes are never double-saved.
  const handleCloseRecipeWindow = () => {
    setIsRecipeDetailOpen(false);
    if (detailRecipe && !savedRecipes.some((r) => r.title === detailRecipe.title)) {
      handleSaveRecipe(detailRecipe);
      setAutoSaveNotice(detailRecipe.title);
      announce(`Auto-saved ${detailRecipe.title} to your recipes.`);
    }
  };

  const setAccent = (accent) => setAppearance((current) => ({ ...current, accent }));
  const toggleLiquidGlass = () => setAppearance((current) => ({ ...current, liquidGlass: !current.liquidGlass }));

  // ── Chat ──────────────────────────────────────────────────────────────────
  const handleSendMessage = async (event, images = []) => {
    event.preventDefault();
    if (!chatInput.trim() && images.length === 0) return;

    const message = chatInput.trim() || (images.length > 0 ? 'What is in this photo / what can I make with it?' : '');
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
          images, // data URLs — chef can see photos of ingredients or dishes
          history: messages, // full history for context
          recipe: activeRecipe, // current recipe context
          savedRecipes, // lets the chef switch context to any saved recipe
        },
      });

      let reply = data.reply || '';

      // The chef can switch the active recipe context on request
      const switchMatch = reply.match(/\[SWITCH_RECIPE:\s*([^\]]+)\]\s*$/);
      if (switchMatch) {
        reply = reply.replace(/\[SWITCH_RECIPE:\s*[^\]]+\]\s*$/, '').trim();
        const target = savedRecipes.find((r) => r.title.toLowerCase() === switchMatch[1].trim().toLowerCase());
        if (target) {
          setActiveRecipe(target);
          reply += `\n\n→ Switched context to “${target.title}”.`;
        }
      }

      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
    } catch (error) {
      setChatError('ChefAI is temporarily unavailable. Please try again.');
    } finally {
      setIsChatLoading(false);
    }
  };

  // Switch the chat's recipe context directly from the Chat view
  const handleSwitchChatRecipe = (recipe) => {
    if (!recipe) return;
    setActiveRecipe(recipe);
    setMessages((current) => [
      ...current,
      { role: 'assistant', content: `Switched context to “${recipe.title}”. Ask me anything about it — substitutions, timing, scaling.` },
    ]);
  };

  // ── Auth ──────────────────────────────────────────────────────────────────
  const applyAuthError = (error) => {
    const data = error?.data || {};
    if (data.requiresChallenge) setPendingChallenge({ challenge: data.challenge });
    if (data.captcha) { setCaptcha(data.captcha); setCaptchaAnswer(''); }
    else if (!data.requiresChallenge) { setCaptcha(null); setCaptchaAnswer(''); }
    setAuthError(error?.message || 'Could not sign you in. Please try again.');
  };

  const resetAuthForm = () => {
    setPassword('');
    setTotpCode('');
    setPendingChallenge(null);
    setCaptcha(null);
    setCaptchaAnswer('');
    setAgeConfirmed(false);
    setAgeYears('');
    setAuthName('');
    setSignupConsent(false);
  };

  // Pull everything that lives on the account: recipes are merged, synced
  // preferences (accent, accessibility) win over this device's cache — that is
  // what makes "log in on my phone, see my laptop's recipes" work.
  const pullAccountData = () => {
    prefsSyncReadyRef.current = false;
    apiRequest('/recipes').then((recipes) => {
      if (!Array.isArray(recipes)) return;
      setSavedRecipes((current) => {
        const byTitle = new Map(current.map((r) => [r.title, r]));
        recipes.forEach((r) => { if (r?.title && !byTitle.has(r.title)) byTitle.set(r.title, r); });
        return Array.from(byTitle.values());
      });
    }).catch(() => { /* offline — local cache stands in */ });
    fetchPrefs().then((prefs) => {
      if (prefs?.appearance?.accent) setAppearance({ ...defaultAppearance, ...prefs.appearance });
      if (prefs?.accessibility) setAccessibilitySettings({ ...defaultAccessibilitySettings, ...prefs.accessibility });
      if (prefs?.plan && typeof prefs.plan === 'object') setPlan((current) => ({ ...current, ...prefs.plan }));
      if (Array.isArray(prefs?.savedIdeas) && prefs.savedIdeas.length > 0) {
        setSavedIdeas((current) => {
          const seen = new Set(current.map((i) => i.title));
          const merged = [...current];
          prefs.savedIdeas.forEach((i) => { if (i?.title && !seen.has(i.title)) merged.push(i); });
          return merged;
        });
      }
      prefsSyncReadyRef.current = true;
    }).catch(() => { prefsSyncReadyRef.current = true; });
  };

  const completeSignIn = (user, isNew) => {
    authEpochRef.current += 1;
    setAuthUser(user);
    markSignedIn();
    setTwoFactorEnabled(Boolean(user?.twoFactorEnabled));
    pullAccountData();
    setIsAuthOpen(false);
    announce(`Signed in${isNew ? '' : ' back'}. Welcome, ${user.name}.`);
    setMessages((current) => [
      ...current,
      { role: 'assistant', content: `Welcome${isNew ? '' : ' back'}, ${user.name}! Ready to cook something great today?` },
    ]);
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password || isAuthBusy) return;
    if (authMode === 'signup' && !signupConsent) {
      setAuthError('Please agree to the Terms & Privacy Policy to create an account.');
      return;
    }
    if (authMode === 'signup' && !ageConfirmed) {
      setAuthError('Please confirm your age to continue.');
      return;
    }

    setIsAuthBusy(true);
    setAuthError('');
    try {
      if (authMode === 'signup') {
        const user = await authSignUp({
          email: email.trim(),
          password,
          name: authName.trim(),
          ageConfirmed,
          ageYears: ageYears ? Number(ageYears) : undefined,
        });
        resetAuthForm();
        completeSignIn(user, true);
        return;
      }

      // Sign-in: the server drives captcha → password → 2FA challenges.
      const result = await authLogin({
        email: email.trim(),
        password,
        challenge: pendingChallenge?.challenge || undefined,
        totp: totpCode || undefined,
        captchaId: captcha?.id,
        captchaAnswer: captcha ? captchaAnswer : undefined,
      });
      resetAuthForm();
      completeSignIn(result.user, false);
    } catch (error) {
      applyAuthError(error);
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    authEpochRef.current += 1;
    prefsSyncReadyRef.current = false;
    await authLogout();
    setAuthUser(null);
    markSignedOut();
    setTwoFactorEnabled(false);
    setIsAuthOpen(false);
    setMessages((current) => [
      ...current,
      { role: 'assistant', content: 'Signed out. Your saved recipes are waiting for you next time!' },
    ]);
  };

  // ── 2FA management (Security panel) ─────────────────────────────────
  const handleOauthUnlink = async (provider) => {
    try {
      await oauthUnlink(provider);
      setOauthLinked((current) => ({ ...current, [provider]: false }));
      setSecurityMessage(provider === 'google' ? 'Google disconnected.' : 'Apple disconnected.');
      announce(provider === 'google' ? 'Google account disconnected.' : 'Apple account disconnected.');
    } catch (error) {
      setSecurityMessage(error.message || 'Could not disconnect that account.');
    }
  };

  const openSecurity = async () => {
    setIsSecurityOpen(true);
    setSecurityMessage('');
    try {
      const status = await auth2faStatus();
      setTwoFactorEnabled(Boolean(status.enabled));
    } catch { /* panel still opens; status defaults to off */ }
  };

  const startTwoFactorSetup = async () => {
    setSecurityMessage('');
    try {
      const setup = await auth2faSetup();
      setTwoFactorSetup(setup);
    } catch (error) {
      setSecurityMessage(error.message);
    }
  };

  const confirmTwoFactorSetup = async () => {
    setSecurityMessage('');
    try {
      const result = await auth2faEnable(twoFactorEnableCode);
      setTwoFactorEnabled(true);
      setTwoFactorBackupCodes(result.backupCodes);
      setTwoFactorSetup(null);
      setTwoFactorEnableCode('');
      announce('Two-factor authentication enabled.');
    } catch (error) {
      setSecurityMessage(error.message);
    }
  };

  const disableTwoFactor = async () => {
    setSecurityMessage('');
    try {
      await auth2faDisable(twoFactorDisablePassword);
      setTwoFactorEnabled(false);
      setTwoFactorBackupCodes(null);
      setTwoFactorDisablePassword('');
      announce('Two-factor authentication disabled.');
    } catch (error) {
      setSecurityMessage(error.message);
    }
  };

  const openAuth = (mode) => {
    setAuthMode(mode);
    setAuthError('');
    setSignupConsent(false);
    setIsAuthOpen(true);
  };

  // Delete account: erases the user, their sessions, and all saved recipes
  const handleDeleteAccount = async () => {
    if (!window.confirm('Delete your account? This erases your profile and ALL saved recipes immediately and cannot be undone.')) return;
    authEpochRef.current += 1;
    try {
      await apiRequest('/auth/account', { method: 'DELETE' });
      setAuthUser(null);
      setSavedRecipes([]);
      setIsAuthOpen(false);
      announce('Your account and all saved recipes have been deleted.');
    } catch {
      window.alert('Could not delete your account. Please try again.');
    }
  };

  // Meal-plan editing: entry = recipe to place, null to clear the slot.
  const handleChangePlan = (date, slot, recipe) => {
    setPlan((current) => {
      const next = { ...current };
      const key = `${date}|${slot}`;
      if (recipe) {
        next[key] = { title: recipe.title, recipeId: recipe.id ?? null };
      } else {
        delete next[key];
      }
      return next;
    });
  };

  // ── Helpers ───────────────────────────────────────────────────────────
  const reduceMotionEnabled = accessibilitySettings.reduceMotion;

  const toggleAccessibilitySetting = (setting) => {
    const next = { ...accessibilitySettings, [setting]: !accessibilitySettings[setting] };
    setAccessibilitySettings(next);
    const option = accessibilityOptionLabels.find((item) => item.key === setting);
    if (option) {
      const state = next[setting] ? 'on' : 'off';
      setLiveAnnouncement(`${option.label} ${state}`);
      if (next.voiceGuidance && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(`${option.label} ${state}`);
        utterance.lang = 'en-US';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
    }
  };

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
    genImage, setGenImage,
    isFindingFromImage,
    onFindFromImage: handleFindFromImage,
  }), [genIngredients, genCuisines, fusionModeActive, customCuisineInput, customCuisines, genDiet, genTime, genServings, genDifficulty, genStrictMode, genAccessibility, customAccessibilityInput, genImage, isFindingFromImage]);

  const highContrast = accessibilitySettings.highContrast;
  const dyslexiaStyle = accessibilitySettings.dyslexiaFont
    ? { fontFamily: 'Atkinson Hyperlegible, "Comic Sans MS", "Segoe UI", sans-serif' }
    : undefined;

  const activeIndex = VIEW_IDS.indexOf(activeView);

  return (
    <MotionConfig reducedMotion={reduceMotionEnabled ? 'always' : 'user'}>
    <div
      role="application"
      aria-roledescription="ChefAI cooking assistant"
      className={`flex h-screen flex-col overflow-hidden text-slate-800 ${highContrast ? 'accessibility-high-contrast-surface' : ''}`} style={{ backgroundImage: `radial-gradient(circle at top left, rgb(var(--theme-page-glow, 255 122 24) / 0.16), transparent 30%), linear-gradient(135deg, var(--theme-page-a, #fffdf9) 0%, var(--theme-page-b, #f8fafc) 100%)` }}
    >
      {/* Screen-reader + voice-guidance announcer: every announced change lands here */}
      <div aria-live="polite" aria-atomic="true" role="status" className="sr-only">{liveAnnouncement}</div>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="liquid-glass z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-none border-x-0 border-t-0 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-ember p-2.5 text-white shadow-lg shadow-ember/30">
            <ChefHat size={20} />
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">ChefAI</p>
            <p className="text-xs text-slate-500">Your AI cooking assistant</p>
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
                      className={`absolute inset-0 rounded-full ${view.accent} shadow`}
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
            aria-label="Open appearance settings"
          >
            <Palette size={17} />
          </button>
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
          {authUser ? (
            <div className="flex items-center gap-2">
              <span
                className="hidden max-w-[180px] items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 sm:inline-flex"
                title={authUser.email}
              >
                <UserRound size={15} className="text-ember" />
                <span className="truncate">{authUser.name}</span>
              </span>
              <button
                className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-600 transition hover:border-red-300 hover:text-red-600"
                onClick={handleSignOut}
                aria-label="Sign out"
                title={`Signed in as ${authUser.email}`}
              >
                <LogOut size={16} />
              </button>
              <button
                className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-600 transition hover:border-ember hover:text-ember"
                onClick={openSecurity}
                aria-label="Open security settings"
                title="Security: two-factor authentication"
              >
                <ShieldCheck size={16} />
              </button>
              <button
                className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-600 transition hover:border-red-300 hover:text-red-600"
                onClick={handleDeleteAccount}
                aria-label="Delete account and all saved recipes"
                title="Delete account and all saved recipes"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ) : (
            <button
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              onClick={() => openAuth('signin')}
              aria-label="Open sign in"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* ── Body: rail + swipeable deck ───────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Left icon rail (macOS style, wide screens) */}
        <nav
          aria-label="Feature rail"
          className={`liquid-glass z-10 hidden w-16 shrink-0 flex-col items-center gap-2 rounded-none border-y-0 border-l-0 py-4 lg:flex ${
            highContrast ? 'bg-slate-900/90' : ''
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
                    ? `${view.accent} text-accent-ink shadow-lg`
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
        <main id="main-content" className="min-w-0 flex-1 overflow-hidden px-4 py-4 sm:px-6">
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
                  mealType={genMealType}
                  onMealTypeChange={setGenMealType}
                  planDate={genPlanDate}
                  onPlanDateChange={setGenPlanDate}
                  minPlanDate={todayISODate()}
                />
              )}
              {activeView === 'saved' && (
                <SavedView
                  savedRecipes={savedRecipes}
                  savedIdeas={savedIdeas}
                  accessibilitySettings={accessibilitySettings}
                  onOpenRecipe={handleOpenRecipeDetail}
                  onDeleteSaved={handleDeleteSaved}
                  onToggleFavorite={handleToggleFavorite}
                  onNavigate={navigateToView}
                  onCookIdea={handleCookSavedIdea}
                  onDeleteIdea={handleDeleteSavedIdea}
                />
              )}
              {activeView === 'calendar' && (
                <CalendarView
                  savedRecipes={savedRecipes}
                  plan={plan}
                  onChangePlan={handleChangePlan}
                  onOpenRecipe={handleOpenRecipeDetail}
                  onNavigate={navigateToView}
                  announce={announce}
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
                  savedRecipes={savedRecipes}
                  onSwitchRecipe={handleSwitchChatRecipe}
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

      {/* ── Idea Picker: full-window overlay ─────────────────────────────── */}
      <AnimatePresence>
        {recipeIdeas && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 backdrop-blur-md"
            role="dialog"
            aria-label="Choose a dish concept"
          >
            <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center px-4 py-10">
              <div className="text-center">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white">
                  <Sparkles size={15} /> ChefAI brainstormed 3 ways to cook this
                </p>
                <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Pick your mission</h2>
                <p className="mt-2 text-white/70">Same ingredients, three levels of ambition. Choose one and ChefAI builds the full recipe.</p>
              </div>

              <div className="mt-10 grid gap-5 md:grid-cols-3">
                {recipeIdeas.map((idea, index) => {
                  const complexityStyles = {
                    Simple: 'from-emerald-500/80 to-emerald-600/80',
                    Intermediate: 'from-amber-500/80 to-amber-600/80',
                    Ambitious: 'from-rose-500/80 to-rose-600/80',
                  };
                  return (
                    <motion.button
                      key={idea.id || index}
                      type="button"
                      onClick={() => handleSelectIdea(idea)}
                      disabled={isSelectingIdea}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.08, duration: 0.35 }}
                      whileHover={reduceMotionEnabled ? undefined : { y: -6 }}
                      className="dark-glass group relative flex flex-col rounded-[26px] p-6 text-left transition disabled:cursor-wait disabled:opacity-70"
                    >
                      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-r ${complexityStyles[idea.complexity] || complexityStyles.Intermediate} px-3 py-1 text-xs font-bold uppercase tracking-wider text-white`}>
                        {idea.complexity || 'Intermediate'}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); handleStarIdea(idea); }}
                        aria-label={`Save "${idea.title}" for later`}
                        title="Save this idea for later"
                        className="absolute right-4 top-4 rounded-full border border-white/15 bg-white/10 p-2 text-white/80 transition hover:scale-110 hover:bg-white/20 hover:text-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                      >
                        <Star size={15} aria-hidden="true" />
                      </button>
                      <h3 className="mt-4 text-xl font-semibold text-white">{idea.title}</h3>
                      <p className="mt-2 flex-1 text-sm leading-6 text-white/70">{idea.description}</p>
                      {idea.keyTwist && (
                        <p className="mt-3 rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 text-xs leading-5 text-white/80">
                          ✨ {idea.keyTwist}
                        </p>
                      )}
                      <div className="mt-5 flex items-center justify-between">
                        <span className="text-sm text-white/60">⏱ {idea.time || '—'}</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-1.5 text-sm font-medium text-white transition group-hover:bg-accent-strong">
                          {isSelectingIdea ? 'Cooking…' : 'Make this'} <ArrowRight size={14} />
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={handleDismissIdeas}
                  className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-medium text-white/80 transition hover:bg-white/20"
                >
                  ← Back to edit my request
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Recipe Floating Window (draggable liquid glass) ───────────── */}
      <AnimatePresence>
        {isRecipeDetailOpen && detailRecipe && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={reduceMotionEnabled ? { duration: 0 } : { type: 'spring', bounce: 0.28, duration: 0.55 }}
            drag
            dragMomentum={false}
            dragElastic={0.08}
            dragListener={isWindowDragArmed}
            className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-[30px] liquid-glass shadow-glass sm:inset-6"
            role="dialog"
            aria-label={`Recipe: ${detailRecipe.title}`}
          >
              {/* Window title bar — press and hold to drag */}
              <div
                className="flex shrink-0 items-center justify-between gap-3 border-b border-white/40 bg-white/40 px-5 py-3.5 backdrop-blur-md select-none"
                onPointerDown={() => setIsWindowDragArmed(true)}
                style={{ cursor: isWindowDragArmed ? 'grabbing' : 'grab' }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Move size={14} className="shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    {detailRecipe.tag && (
                      <span className="rounded-full bg-ember/15 px-2.5 py-0.5 text-[11px] font-semibold text-accent-ink">{detailRecipe.tag}</span>
                    )}
                    <h2 className="truncate text-lg font-semibold text-slate-900">{detailRecipe.title}</h2>
                  </div>
                </div>
                <button
                  onClick={handleCloseRecipeWindow}
                  className="shrink-0 rounded-full border border-slate-200 bg-white/80 p-2 text-slate-600 transition hover:border-ember hover:text-ember"
                  aria-label="Close recipe window"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                {/* Meta */}
                <div className="flex flex-wrap gap-2 text-sm">
                  {detailRecipe.time && <span className="rounded-full bg-white/70 px-3 py-1 text-slate-600">{detailRecipe.time}</span>}
                  {detailRecipe.difficulty && <span className="rounded-full bg-white/70 px-3 py-1 text-slate-600">{detailRecipe.difficulty}</span>}
                  {detailRecipe.servings && <span className="rounded-full bg-white/70 px-3 py-1 text-slate-600">Serves {detailRecipe.servings}</span>}
                  {detailRecipe.cuisine && <span className="rounded-full bg-white/70 px-3 py-1 text-slate-600">{detailRecipe.cuisine}</span>}
                </div>

                <p className="leading-7 text-slate-700">{detailRecipe.description}</p>

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
                        <div key={n.label} className="rounded-[14px] border border-white/60 bg-white/60 px-2 py-2 text-center">
                          <p className="text-xs text-slate-500">{n.label}</p>
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
                        <li key={i} className="flex items-center gap-3 rounded-[14px] border border-white/60 bg-white/60 px-4 py-2.5 text-sm text-slate-700">
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
                        <li key={i} className="flex gap-3 rounded-[16px] border border-white/60 bg-white/60 px-4 py-3">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ember/15 text-xs font-bold text-ember">{i + 1}</span>
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

                {/* Learn it: video + article links (AI-suggested queries → real sources) */}
                {detailRecipe.tutorials && (
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Video size={16} className="text-ember" /> Learn to make it</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <a
                        href={detailRecipe.tutorials.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-[16px] border border-white/60 bg-white/60 px-4 py-3 transition hover:border-ember"
                      >
                        <Video size={18} className="shrink-0 text-ember" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-800">Watch a video tutorial</span>
                          <span className="block truncate text-xs text-slate-500">{detailRecipe.tutorials.videoQuery}</span>
                        </span>
                      </a>
                      <a
                        href={detailRecipe.tutorials.articleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-[16px] border border-white/60 bg-white/60 px-4 py-3 transition hover:border-ember"
                      >
                        <Newspaper size={18} className="shrink-0 text-ember" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-800">Read an in-depth guide</span>
                          <span className="block truncate text-xs text-slate-500">{detailRecipe.tutorials.articleQuery}</span>
                        </span>
                      </a>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">Opens real search results across YouTube and the web — technique-focused, source-agnostic.</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleSaveRecipe(detailRecipe)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium text-white transition ${saveSuccess ? 'bg-emerald-600' : 'bg-ember hover:bg-accent-strong'}`}
                  >
                    <BookmarkPlus size={16} /> {saveSuccess ? 'Saved!' : 'Save recipe'}
                  </button>
                  <button
                    onClick={handleCloseRecipeWindow}
                    className="rounded-full border border-slate-200 bg-white/80 px-6 py-2.5 text-sm font-medium text-slate-600"
                  >
                    Close
                  </button>
                </div>
              </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Auto-save toast ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {autoSaveNotice && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            role="status"
            className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-xl"
          >
            <Check size={15} /> Auto-saved “{autoSaveNotice}” to your recipes
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
                  <p className="text-sm font-medium text-slate-500">Welcome to ChefAI</p>
                  <h2 className="text-2xl font-semibold text-slate-900">
                    {authMode === 'signup' ? 'Create your account' : 'Sign in'}
                  </h2>
                </div>
                <button type="button" onClick={() => setIsAuthOpen(false)} className="rounded-full border border-slate-200 p-2 text-slate-600" aria-label="Close sign in">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="mt-6 space-y-4">
                {authMode === 'signup' && (
                  <label className="block text-sm font-medium text-slate-700">
                    Name
                    <input
                      aria-label="Name"
                      type="text"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="How should ChefAI greet you?"
                      className="mt-2 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-ember"
                    />
                  </label>
                )}
                <label className="block text-sm font-medium text-slate-700">
                  Email
                  <input aria-label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-ember" />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Password
                  <input
                    aria-label="Password"
                    type="password"
                    required
                    minLength={authMode === 'signup' ? 8 : 1}
                    autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={authMode === 'signup' ? 'At least 8 characters' : ''}
                    className="mt-2 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-ember"
                  />
                </label>

                {authMode === 'signup' && password && (() => {
                  const strength = passwordStrength(password);
                  const problems = passwordProblems(password, { email });
                  const colors = ['bg-red-400', 'bg-red-400', 'bg-amber-400', 'bg-lime-500', 'bg-emerald-500'];
                  return (
                    <div aria-live="polite">
                      <div className="flex gap-1" aria-hidden="true">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength.score ? colors[strength.score] : 'bg-slate-200'}`} />
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{strength.label || 'Enter a password'}
                        {problems.length > 0 && <span className="text-slate-400"> — {problems.join(', ')}</span>}
                      </p>
                    </div>
                  );
                })()}

                {authMode === 'signup' && (
                  <div className="space-y-2 rounded-[18px] border border-amber-200 bg-amber-50/70 p-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Your age
                      <input
                        aria-label="Your age"
                        type="number"
                        min={5}
                        max={120}
                        inputMode="numeric"
                        value={ageYears}
                        onChange={(e) => setAgeYears(e.target.value)}
                        placeholder="e.g. 16"
                        className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember"
                      />
                    </label>
                    <label className="flex items-start gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={ageConfirmed}
                        onChange={(e) => setAgeConfirmed(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-ember"
                      />
                      <span>I confirm I am 13 years of age or older. ChefAI is not directed to children under 13 (COPPA).</span>
                    </label>
                  </div>
                )}

                {captcha && authMode === 'signin' && (
                  <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Security check
                      <input
                        aria-label={`Security check: ${captcha.question}`}
                        type="number"
                        inputMode="numeric"
                        value={captchaAnswer}
                        onChange={(e) => setCaptchaAnswer(e.target.value)}
                        placeholder={captcha.question}
                        className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-ember"
                      />
                    </label>
                  </div>
                )}

                {pendingChallenge && (
                  <div className="rounded-[18px] border border-ember/30 bg-ember/5 p-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Two-factor code
                      <input
                        aria-label="Two-factor authentication code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={11}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        placeholder="6-digit code or backup code"
                        className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-4 py-2.5 text-sm tracking-widest outline-none focus:border-ember"
                      />
                    </label>
                    <p className="mt-1 text-xs text-slate-500">Enter the code from your authenticator app, or one of your backup codes.</p>
                  </div>
                )}

                {authMode === 'signup' && (
                  <ConsentCheckbox checked={signupConsent} onChange={setSignupConsent} error={authError && authError.startsWith('Please agree') ? authError : ''} />
                )}

                {authError && !authError.startsWith('Please agree') && (
                  <p role="alert" className="rounded-[16px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{authError}</p>
                )}

                <button
                  type="submit"
                  disabled={isAuthBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-ember px-4 py-2.5 font-medium text-white shadow shadow-ember/30 transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAuthBusy && <Loader2 size={16} className="animate-spin" />}
                  {authMode === 'signup' ? 'Create account' : 'Continue'}
                </button>
              </form>

              {/* ── Social sign-in: only shown when the server is configured ── */}
              {(oauthProviders.google || oauthProviders.apple) && (
                <>
                  <div className="my-4 flex items-center gap-3" aria-hidden="true">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-400">or continue with</span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {oauthProviders.google && (
                      <a
                        href={oauthStartUrl('google')}
                        className="flex items-center justify-center gap-2 rounded-[16px] border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        <GoogleG aria-hidden="true" /> Google
                      </a>
                    )}
                    {oauthProviders.apple && (
                      <a
                        href={oauthStartUrl('apple')}
                        className="flex items-center justify-center gap-2 rounded-[16px] bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                      >
                        <AppleMark aria-hidden="true" /> Apple
                      </a>
                    )}
                  </div>
                </>
              )}

              {authMode === 'signup' && (
                <p className="mt-2 text-center text-[11px] leading-snug text-slate-500">
                  By creating an account you consent to the documents above. Read them first:
                  {' '}
                  <button type="button" className="font-semibold text-ember hover:underline" onClick={() => { setIsAuthOpen(false); setActiveDoc('terms'); }}>Terms</button>
                  {' · '}
                  <button type="button" className="font-semibold text-ember hover:underline" onClick={() => { setIsAuthOpen(false); setActiveDoc('privacy'); }}>Privacy Policy</button>
                  {' · '}
                  <button type="button" className="font-semibold text-ember hover:underline" onClick={() => { setIsAuthOpen(false); setActiveDoc('cookies'); }}>Cookie Policy</button>
                </p>
              )}

              <p className="mt-5 text-center text-sm text-slate-600">
                {authMode === 'signup' ? 'Already have an account?' : 'New to ChefAI?'}{' '}
                <button
                  type="button"
                  className="font-semibold text-ember hover:underline"
                  onClick={() => setAuthMode(authMode === 'signup' ? 'signin' : 'signup')}
                >
                  {authMode === 'signup' ? 'Sign in' : 'Create one free'}
                </button>
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Security Panel (2FA) ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isSecurityOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm"
            onClick={() => setIsSecurityOpen(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              role="dialog"
              aria-label="Security settings"
              className="w-full max-w-md rounded-[30px] border border-white/70 bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">Security</p>
                  <h2 className="text-2xl font-semibold text-slate-900">Two-factor authentication</h2>
                </div>
                <button type="button" onClick={() => setIsSecurityOpen(false)} className="rounded-full border border-slate-200 p-2 text-slate-600" aria-label="Close security settings">
                  <X size={18} />
                </button>
              </div>

              {twoFactorBackupCodes && (
                <div className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-800">Save your backup codes now</p>
                  <p className="mt-1 text-xs text-emerald-700">Each code works once, instead of a 2FA code. They are shown only this once.</p>
                  <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs text-emerald-900">
                    {twoFactorBackupCodes.map((code) => <span key={code}>{code}</span>)}
                  </div>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard?.writeText(twoFactorBackupCodes.join('\n')); setSecurityMessage('Backup codes copied to clipboard.'); }}
                    className="mt-3 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    Copy codes
                  </button>
                </div>
              )}

              {!twoFactorEnabled && !twoFactorSetup && (
                <div className="mt-4">
                  <p className="text-sm text-slate-600">
                    Add a second step to sign-in using any authenticator app (Google Authenticator, Authy, 1Password). Even if your password leaks, your account stays safe.
                  </p>
                  <button
                    type="button"
                    onClick={startTwoFactorSetup}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ember px-4 py-2.5 font-medium text-white shadow shadow-ember/30 transition hover:bg-ember/90"
                  >
                    <ShieldCheck size={16} /> Set up 2FA
                  </button>
                </div>
              )}

              {twoFactorSetup && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-slate-600">1. Add this secret to your authenticator app (manual entry):</p>
                  <code className="block break-all rounded-[14px] bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800" aria-label="Two-factor secret">{twoFactorSetup.secret}</code>
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer">Or paste the otpauth:// URI into your app</summary>
                    <code className="mt-1 block break-all rounded-[14px] bg-slate-50 px-3 py-2 font-mono">{twoFactorSetup.otpauth}</code>
                  </details>
                  <label className="block text-sm font-medium text-slate-700">
                    2. Enter the 6-digit code it shows
                    <input
                      aria-label="Authenticator code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      value={twoFactorEnableCode}
                      onChange={(e) => setTwoFactorEnableCode(e.target.value)}
                      placeholder="123456"
                      className="mt-2 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm tracking-widest outline-none focus:border-ember"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={confirmTwoFactorSetup}
                    disabled={twoFactorEnableCode.length !== 6}
                    className="flex w-full items-center justify-center rounded-full bg-ember px-4 py-2.5 font-medium text-white shadow shadow-ember/30 transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Enable 2FA
                  </button>
                </div>
              )}

              {twoFactorEnabled && !twoFactorBackupCodes && (
                <div className="mt-4 space-y-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><BadgeCheck size={16} /> 2FA is active on your account.</p>
                  <details className="text-sm">
                    <summary className="cursor-pointer text-slate-600">Turn 2FA off</summary>
                    <label className="mt-2 block text-sm font-medium text-slate-700">
                      Confirm your password to disable
                      <input
                        aria-label="Password to disable two-factor"
                        type="password"
                        autoComplete="current-password"
                        value={twoFactorDisablePassword}
                        onChange={(e) => setTwoFactorDisablePassword(e.target.value)}
                        className="mt-2 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-ember"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={disableTwoFactor}
                      disabled={!twoFactorDisablePassword}
                      className="mt-2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Disable 2FA
                    </button>
                  </details>
                </div>
              )}

              {securityMessage && <p role="status" className="mt-3 text-sm text-slate-600">{securityMessage}</p>}

              {/* ── Connected accounts: multi sign-in per account ────────── */}
              {(oauthProviders.google || oauthProviders.apple) && (
                <div className="mt-5 border-t border-slate-200 pt-4">
                  <p className="text-sm font-semibold text-slate-700">Connected accounts</p>
                  <p className="mt-0.5 text-xs text-slate-500">Sign in with these even without your password.</p>
                  <div className="mt-3 space-y-2">
                    {oauthProviders.google && (
                      <div className="flex items-center justify-between gap-2 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="flex items-center gap-2 text-sm text-slate-700"><GoogleG /> Google {oauthLinked.google && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">connected</span>}</span>
                        {oauthLinked.google ? (
                          <button
                            type="button"
                            onClick={() => handleOauthUnlink('google')}
                            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-red-300 hover:text-red-500"
                          >
                            Disconnect
                          </button>
                        ) : (
                          <a
                            href={oauthStartUrl('google', 'link')}
                            className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-slate-700"
                          >
                            Connect
                          </a>
                        )}
                      </div>
                    )}
                    {oauthProviders.apple && (
                      <div className="flex items-center justify-between gap-2 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="flex items-center gap-2 text-sm text-slate-700"><AppleMark /> Apple {oauthLinked.apple && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">connected</span>}</span>
                        {oauthLinked.apple ? (
                          <button
                            type="button"
                            onClick={() => handleOauthUnlink('apple')}
                            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-red-300 hover:text-red-500"
                          >
                            Disconnect
                          </button>
                        ) : (
                          <a
                            href={oauthStartUrl('apple', 'link')}
                            className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-slate-700"
                          >
                            Connect
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
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
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Accent color</p>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Accent color">
                {ACCENT_THEMES.map((theme) => {
                  const isActive = appearance.accent === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      aria-label={`${theme.label} accent`}
                      title={theme.label}
                      onClick={() => setAccent(theme.id)}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${
                        isActive ? 'border-slate-900 scale-110' : 'border-slate-200 hover:scale-105'
                      }`}
                      style={{ backgroundColor: theme.swatch }}
                    >
                      {isActive && (
                        <Check size={14} className="text-ember drop-shadow" style={{ color: theme.id === 'white' || theme.id === 'yellow' ? '#334155' : '#ffffff' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 transition hover:border-ember/30">
              <p className="font-medium text-slate-700">Liquid glass</p>
              <button
                type="button"
                role="switch"
                aria-checked={appearance.liquidGlass}
                aria-label="Liquid glass"
                onClick={toggleLiquidGlass}
                className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                  appearance.liquidGlass ? 'bg-ember' : 'bg-slate-300'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    appearance.liquidGlass ? 'translate-x-[18px]' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {accessibilityOptionLabels.map((option) => (
                <div
                  key={option.key}
                  className="flex items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 transition hover:border-ember/30"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-700">{option.label}</p>
                    <p className="text-xs leading-snug text-slate-500">{option.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={accessibilitySettings[option.key]}
                    aria-label={option.label}
                    onClick={() => toggleAccessibilitySetting(option.key)}
                    className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                      accessibilitySettings[option.key] ? 'bg-ember' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        accessibilitySettings[option.key] ? 'translate-x-[18px]' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cookie / processing consent banner ─────────────────────────── */}
      {!consent.decided && (
        <ConsentBanner
          onDecide={(record) => {
            setConsent(record);
            announce('Privacy choices saved. You can change them anytime in the footer.');
          }}
        />
      )}

      {/* ── Footer: legal links + change consent ───────────────────────── */}
      <footer className="shrink-0 border-t border-slate-900/10 px-4 py-2.5 sm:px-6">
        <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span>© {new Date().getFullYear()} ChefAI · AI-generated recipes — verify food safety</span>
          <button type="button" className="font-medium underline decoration-slate-300 underline-offset-2 hover:text-ember" onClick={() => setActiveDoc('privacy')}>Privacy Policy</button>
          <button type="button" className="font-medium underline decoration-slate-300 underline-offset-2 hover:text-ember" onClick={() => setActiveDoc('terms')}>Terms &amp; Conditions</button>
          <button type="button" className="font-medium underline decoration-slate-300 underline-offset-2 hover:text-ember" onClick={() => setActiveDoc('cookies')}>Cookie Policy</button>
          <button type="button" className="font-medium underline decoration-slate-300 underline-offset-2 hover:text-ember" onClick={() => setActiveDoc('refund')}>Refund Policy</button>
          <button
            type="button"
            className="font-medium underline decoration-slate-300 underline-offset-2 hover:text-ember"
            onClick={() => {
              localStorage.removeItem('chefai-cookie-consent');
              setConsent(readStoredConsent());
            }}
            aria-label="Review cookie and privacy choices"
          >
            Cookie choices
          </button>
        </nav>
      </footer>

      {/* ── Legal document viewer ──────────────────────────────────────── */}
      {activeDoc && (
        <LegalDocs docId={activeDoc} onClose={() => setActiveDoc(null)} />
      )}
    </div>
    </MotionConfig>
  );
}

export default App;
