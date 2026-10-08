import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ui.css';
import { IconClose } from './icons.jsx';
import { Button } from './Button.jsx';
import { useEscapeKey } from '../../hooks/useEscapeKey.js';

/**
 * The one modal in the application.
 *
 * Every panel in the game and the interface renders through this: location
 * panels, job details, missions, the AI centre. One implementation means ESC,
 * focus handling, the backdrop and the mobile sheet behaviour are correct
 * everywhere rather than in whichever panel was written most recently.
 */
export function Modal({
  title,
  subtitle,
  eyebrow,
  size = 'md',
  onClose,
  footer,
  children,
  flush = false,
  closeOnBackdrop = true,
  headerAccent,
}) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  const handleClose = useCallback(() => onClose?.(), [onClose]);
  useEscapeKey(handleClose, Boolean(onClose));

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      // Returning focus matters when a panel was opened from the world: the
      // player should get keyboard control back without clicking.
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, []);

  /** Keep tab focus inside the panel while it is open. */
  const onKeyDown = (event) => {
    if (event.key !== 'Tab') return;
    const focusables = panelRef.current?.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="g-modal-root">
      <button
        type="button"
        className="g-modal__backdrop"
        aria-label="Close panel"
        tabIndex={-1}
        onClick={closeOnBackdrop ? handleClose : undefined}
      />
      <div
        ref={panelRef}
        className={`g-modal g-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="g-modal__header">
          {headerAccent ? (
            <span
              aria-hidden="true"
              style={{
                width: 4,
                alignSelf: 'stretch',
                borderRadius: 'var(--g-radius-pill)',
                background: headerAccent,
              }}
            />
          ) : null}
          <div className="g-modal__heading">
            {eyebrow ? <p className="g-eyebrow">{eyebrow}</p> : null}
            <h2 className="g-modal__title">{title}</h2>
            {subtitle ? <p className="g-modal__subtitle">{subtitle}</p> : null}
          </div>
          {onClose ? (
            <button type="button" className="g-modal__close" onClick={handleClose} aria-label="Close">
              <IconClose size={16} />
            </button>
          ) : null}
        </header>

        <div className={`g-modal__body${flush ? ' g-modal__body--flush' : ''}`}>{children}</div>

        {footer ? <footer className="g-modal__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation used before anything consequential, such as submitting an application. */
export function ConfirmDialog({ title, body, confirmLabel = 'Confirm', onConfirm, onCancel, loading, tone = 'primary' }) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={loading ? undefined : onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="g-muted">{body}</p>
    </Modal>
  );
}
