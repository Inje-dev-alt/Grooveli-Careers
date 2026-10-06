import './hud.css';
import { IconClose } from '../ui/index.js';
import { useUiStore } from '../../stores/uiStore.js';

/** Transient feedback: XP awards, level-ups, mission completions, failures. */
export function ToastStack() {
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone ?? 'info'}`}>
          <div className="toast__body">
            <span className="toast__title">{toast.title}</span>
            {toast.body ? <span className="toast__text">{toast.body}</span> : null}
          </div>
          {toast.xp ? <span className="toast__xp">+{toast.xp} XP</span> : null}
          <button
            type="button"
            className="hud-btn"
            style={{ width: 24, height: 24, background: 'transparent', border: 0, boxShadow: 'none' }}
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
          >
            <IconClose size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
