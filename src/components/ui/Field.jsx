import { useId } from 'react';
import './ui.css';
import { IconSearch } from './icons.jsx';

/**
 * A labelled form field.
 *
 * Pass `htmlFor` and give the control the matching `id` — a <label> with
 * neither a `for` nor a control inside it labels nothing at all, so the field
 * is announced as an unlabelled text box however clear the words above it look.
 *
 * `group` is for the case where the thing being labelled is not one control
 * but several — a row of toggle chips, say. A <label> cannot point at a group,
 * so this renders the caption as plain text and names the group with it
 * instead, which is the only way the set gets announced as "Work type" rather
 * than as three loose buttons.
 */
export function Field({ label, hint, htmlFor, group = false, children }) {
  const labelId = `${useId()}-label`;

  if (group) {
    return (
      <div className="g-field" role="group" aria-labelledby={label ? labelId : undefined}>
        {label ? (
          <span className="g-field__label" id={labelId}>
            {label}
          </span>
        ) : null}
        {children}
        {hint ? <span className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>{hint}</span> : null}
      </div>
    );
  }

  return (
    <div className="g-field">
      {label ? (
        <label className="g-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {hint ? <span className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>{hint}</span> : null}
    </div>
  );
}

export function TextInput({ className = '', ...rest }) {
  return <input className={`g-input ${className}`} {...rest} />;
}

export function TextArea({ className = '', ...rest }) {
  return <textarea className={`g-textarea ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select className={`g-select ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', ...rest }) {
  return (
    <div className="g-search">
      <span className="g-search__icon">
        <IconSearch size={16} />
      </span>
      <input
        type="search"
        className="g-input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
    </div>
  );
}

export function Chip({ active, onClick, children, ...rest }) {
  return (
    <button type="button" className="g-chip" aria-pressed={Boolean(active)} onClick={onClick} {...rest}>
      {children}
    </button>
  );
}
