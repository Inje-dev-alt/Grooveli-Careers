import { NavLink, useNavigate } from 'react-router-dom';
import './employer.css';
import { Button, CompanyMark, IconMenu, IconUser } from '../ui/index.js';
import { useEmployerStore } from '../../stores/employerStore.js';
import { useAuthStore, selectCanSwitchRole } from '../../stores/authStore.js';
import { useUiStore } from '../../stores/uiStore.js';

const EMPLOYER_NAV = [
  { to: '/employer', label: 'Dashboard', end: true },
  { to: '/employer/jobs', label: 'Jobs' },
  { to: '/employer/candidates', label: 'Candidates' },
  { to: '/employer/company', label: 'Company' },
];

/**
 * Chrome for the employer space.
 *
 * Deliberately not the candidate shell: an employer is running a hiring
 * process, not developing a career, and showing them an XP bar would make
 * neither experience make sense. The account is the same; the product is not.
 */
export function EmployerShell({ children }) {
  const navigate = useNavigate();
  const organization = useEmployerStore((s) => s.organization);
  const membership = useEmployerStore((s) => s.membership);
  const toggleMenu = useUiStore((s) => s.toggleMenu);
  const switchRole = useAuthStore((s) => s.switchRole);
  const canSwitchRole = useAuthStore(selectCanSwitchRole);

  const goToCandidate = async () => {
    await switchRole('candidate');
    navigate('/city');
  };

  return (
    <div className="employer">
      <header className="employer__bar">
        <div className="employer__identity">
          <CompanyMark name={organization?.name ?? 'Grooveli'} color={organization?.logoColor ?? '#6c8cff'} />
          <div className="employer__company">
            <p className="employer__company-name g-truncate">{organization?.name ?? 'Employer space'}</p>
            <p className="employer__company-meta g-truncate">
              {membership?.title ? `${membership.title} · ` : ''}Grooveli Employer
            </p>
          </div>
        </div>

        <nav className="employer__nav" aria-label="Employer sections">
          {EMPLOYER_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `navlink${isActive ? ' navlink--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="employer__actions">
          {canSwitchRole ? (
            <Button variant="ghost" size="sm" icon={<IconUser size={15} />} onClick={goToCandidate}>
              Candidate space
            </Button>
          ) : null}
          <button type="button" className="hud-btn" onClick={toggleMenu} aria-label="Open menu">
            <IconMenu size={18} />
          </button>
        </div>
      </header>

      {children}
    </div>
  );
}

/** Standard employer page frame. */
export function EmployerPage({ title, lede, action, children }) {
  return (
    <main className="employer__page">
      <div className="page__head">
        <div>
          <h1 className="page__title">{title}</h1>
          {lede ? <p className="page__lede">{lede}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </main>
  );
}
