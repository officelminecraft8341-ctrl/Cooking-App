import { useState, useRef } from 'react';
import { Bot, Send, Loader2, AlertCircle, Sparkles, ArrowRight, Camera, ImagePlus, X, ChefHat, ChevronDown } from 'lucide-react';
import { fileToDataUrl } from '../apiClient';

export default function ChatView({
  messages,
  chatInput,
  setChatInput,
  isChatLoading,
  chatError,
  activeRecipe,
  savedRecipes = [],
  onSwitchRecipe,
  chatBottomRef,
  onSendMessage,
  onNavigate,
  accessibilitySettings,
}) {
  const highContrast = accessibilitySettings.highContrast;
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [pendingImages, setPendingImages] = useState([]);
  const [imageError, setImageError] = useState('');
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  const addImages = async (files) => {
    setImageError('');
    const incoming = [...files].slice(0, 3 - pendingImages.length);
    try {
      const dataUrls = await Promise.all(incoming.map((file) => fileToDataUrl(file, 1024, 0.82)));
      setPendingImages((current) => [...current, ...dataUrls].slice(0, 3));
    } catch (error) {
      setImageError(error.message || 'Could not add that image');
    }
  };

  const handleSubmit = (event) => {
    if (isChatLoading || (!chatInput.trim() && pendingImages.length === 0)) return;
    onSendMessage(event, pendingImages);
    setPendingImages([]);
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <div className={`flex min-h-0 flex-1 flex-col rounded-[28px] p-5 sm:p-6 ${
        highContrast ? 'bg-slate-800' : 'dark-glass'
      } text-white`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot size={18} />
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">ChefAI chat</p>
          </div>
          <div className="relative flex items-center gap-2">
            {/* Recipe context switcher — pick any saved recipe for the chef to discuss */}
            <button
              type="button"
              onClick={() => setIsContextMenuOpen((open) => !open)}
              className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-ember/50 hover:text-white"
              aria-haspopup="listbox"
              aria-expanded={isContextMenuOpen}
              aria-label="Switch recipe context"
            >
              <ChefHat size={12} className="shrink-0 text-ember" />
              <span className="truncate">
                {activeRecipe ? (
                  <>Context: <span className="text-ember">{activeRecipe.title}</span></>
                ) : (
                  'No recipe context'
                )}
              </span>
              <ChevronDown size={12} className="shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('generate')}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:border-ember/50 hover:text-white"
              aria-label="Open in recipe studio"
              title="Open in recipe studio"
            >
              <Sparkles size={12} />
            </button>

            {isContextMenuOpen && (
              <div
                className="absolute right-0 top-full z-20 mt-2 max-h-64 w-64 overflow-y-auto rounded-[18px] border border-white/10 bg-slate-900 p-2 shadow-2xl"
                role="listbox"
                aria-label="Saved recipes"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={!activeRecipe}
                  onClick={() => { onSwitchRecipe(null); setIsContextMenuOpen(false); }}
                  className="block w-full truncate rounded-[12px] px-3 py-2 text-left text-xs text-slate-300 transition hover:bg-white/10"
                >
                  — No recipe context —
                </button>
                {activeRecipe && (
                  <button
                    type="button"
                    role="option"
                    aria-selected
                    onClick={() => setIsContextMenuOpen(false)}
                    className="block w-full truncate rounded-[12px] bg-ember/20 px-3 py-2 text-left text-xs font-medium text-ember"
                  >
                    ✓ {activeRecipe.title} <span className="font-normal text-slate-400">(current)</span>
                  </button>
                )}
                {savedRecipes.filter((r) => r.title !== activeRecipe?.title).map((recipe) => (
                  <button
                    key={recipe.title}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => { onSwitchRecipe(recipe); setIsContextMenuOpen(false); }}
                    className="block w-full truncate rounded-[12px] px-3 py-2 text-left text-xs text-slate-300 transition hover:bg-white/10"
                  >
                    {recipe.title}
                  </button>
                ))}
                {savedRecipes.length === 0 && !activeRecipe && (
                  <p className="px-3 py-2 text-xs text-slate-500">Save recipes and they'll appear here.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Messages — fills the available view height */}
        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto rounded-[24px] border border-white/10 bg-white/10 p-4 scrollbar-thin">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`whitespace-pre-line rounded-[18px] px-3 py-2 text-sm ${
                message.role === 'assistant'
                  ? 'bg-white/10 text-slate-200'
                  : 'ml-4 bg-ember/80 text-white'
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

        {/* Pending image previews */}
        {pendingImages.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {pendingImages.map((src, index) => (
              <div key={index} className="relative">
                <img src={src} alt={`Attachment ${index + 1}`} className="h-16 w-16 rounded-[14px] border border-white/20 object-cover" />
                <button
                  type="button"
                  onClick={() => setPendingImages((current) => current.filter((_, i) => i !== index))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900 p-0.5 text-slate-300 ring-1 ring-white/20"
                  aria-label={`Remove image ${index + 1}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {imageError && <p className="mt-2 text-xs text-red-300">{imageError}</p>}

        {/* Composer — with camera + photo upload */}
        <form onSubmit={handleSubmit} className="mt-4 rounded-[20px] border border-white/10 bg-white/10 p-2">
          <div className="flex items-center gap-2">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => { addImages(event.target.files); event.target.value = ''; }}
              aria-hidden="true"
              tabIndex={-1}
            />
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => { addImages(event.target.files); event.target.value = ''; }}
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isChatLoading || pendingImages.length >= 3}
              className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-ember/50 hover:text-ember disabled:opacity-40"
              aria-label="Take a photo of what you have"
              title="Take a photo of your ingredients or a dish"
            >
              <Camera size={16} />
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={isChatLoading || pendingImages.length >= 3}
              className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-ember/50 hover:text-ember disabled:opacity-40"
              aria-label="Upload a photo"
              title="Upload a photo of your ingredients or a dish"
            >
              <ImagePlus size={16} />
            </button>
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder={pendingImages.length > 0 ? 'Ask about your photo…' : 'Ask ChefAI anything about cooking…'}
              className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
              aria-label="Ask ChefAI"
              disabled={isChatLoading}
            />
            <button
              type="submit"
              disabled={isChatLoading || (!chatInput.trim() && pendingImages.length === 0)}
              className="rounded-full bg-ember p-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
            >
              {isChatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Tip: swipe, use ← → keys, or the tabs above to move between features.</span>
          <button
            type="button"
            onClick={() => onNavigate('saved')}
            className="inline-flex items-center gap-1 transition hover:text-slate-300"
          >
            Jump to saved recipes <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
