import './ui.css';
import { IconSearch } from './icons.jsx';

export function Field({ label, hint, htmlFor, children }) {
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
