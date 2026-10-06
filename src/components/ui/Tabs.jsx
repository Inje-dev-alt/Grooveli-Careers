import './ui.css';

/** @param {{ tabs: {id:string,label:string,count?:number}[], value: string, onChange: (id:string)=>void }} props */
export function Tabs({ tabs, value, onChange, ariaLabel = 'Sections' }) {
  return (
    <div className="g-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="g-tab"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {typeof tab.count === 'number' ? <span className="g-dim"> {tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
