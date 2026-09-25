import { Bot, Send, Loader2, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';

export default function ChatView({
  messages,
  chatInput,
  setChatInput,
  isChatLoading,
  chatError,
  activeRecipe,
  chatBottomRef,
  onSendMessage,
  onNavigate,
  accessibilitySettings,
}) {
  const highContrast = accessibilitySettings.highContrast;

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <div className={`flex min-h-0 flex-1 flex-col rounded-[28px] border p-5 shadow-soft sm:p-6 ${
        highContrast ? 'border-slate-600 bg-slate-800' : 'border-white/70 bg-slate-950/95'
      } text-white`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot size={18} />
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">ChefAI chat</p>
          </div>
          {activeRecipe ? (
            <button
              type="button"
              onClick={() => onNavigate('generate')}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-ember/50 hover:text-white"
            >
              Context: <span className="text-ember">{activeRecipe.title}</span> · open in studio
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('generate')}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-ember/50 hover:text-white"
            >
              <Sparkles size={12} /> Generate a recipe to add context
            </button>
          )}
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

        {/* Composer */}
        <form onSubmit={onSendMessage} className="mt-4 flex items-center gap-2 rounded-[20px] border border-white/10 bg-white/10 p-2">
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
