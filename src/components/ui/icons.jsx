/**
 * Inline icon set.
 *
 * Drawn here rather than pulled from an icon package: the set is small, it
 * keeps the bundle free of a dependency used for a dozen glyphs, and the
 * stroke weight stays consistent with the rest of the interface.
 */
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const Icon = ({ children, size, ...rest }) => (
  <svg {...base} {...(size ? { width: size, height: size } : null)} {...rest} aria-hidden="true">
    {children}
  </svg>
);

export const IconSearch = (p) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></Icon>
);
export const IconClose = (p) => (
  <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>
);
export const IconChevronRight = (p) => (
  <Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>
);
export const IconChevronLeft = (p) => (
  <Icon {...p}><path d="m15 6-6 6 6 6" /></Icon>
);
export const IconBell = (p) => (
  <Icon {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-2 8-2 8h16s-2-1-2-8" /><path d="M13.7 20a2 2 0 0 1-3.4 0" /></Icon>
);
export const IconMenu = (p) => (
  <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>
);
export const IconUser = (p) => (
  <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>
);
export const IconBriefcase = (p) => (
  <Icon {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" /></Icon>
);
export const IconTarget = (p) => (
  <Icon {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></Icon>
);
export const IconSparkle = (p) => (
  <Icon {...p}><path d="M12 3.5 13.8 9l5.7 1.9-5.7 1.9L12 18.3l-1.8-5.5L4.5 11l5.7-1.9z" /><path d="M18.5 4.5v3M20 6h-3" /></Icon>
);
export const IconMap = (p) => (
  <Icon {...p}><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 7z" /><path d="M9 4v13M15 7v12.5" /></Icon>
);
export const IconHome = (p) => (
  <Icon {...p}><path d="m4 11 8-7 8 7" /><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" /></Icon>
);
export const IconBookmark = ({ filled, ...p }) => (
  <Icon {...p}><path d="M6 4h12v16l-6-4.5L6 20z" fill={filled ? 'currentColor' : 'none'} /></Icon>
);
export const IconCheck = (p) => (
  <Icon {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>
);
export const IconLock = (p) => (
  <Icon {...p}><rect x="4.5" y="10" width="15" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Icon>
);
export const IconSend = (p) => (
  <Icon {...p}><path d="M21 3 3 10.5l7 2.7 2.7 7z" /><path d="M21 3 10 14" /></Icon>
);
export const IconMapPin = (p) => (
  <Icon {...p}><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11" /><circle cx="12" cy="10" r="2.6" /></Icon>
);
export const IconTrendUp = (p) => (
  <Icon {...p}><path d="M3 17 9.5 10.5l4 4L21 7" /><path d="M15 7h6v6" /></Icon>
);
export const IconAward = (p) => (
  <Icon {...p}><circle cx="12" cy="9" r="5.5" /><path d="m8.5 13.5-1.5 7L12 18l4.5 2.5-1.5-7" /></Icon>
);
export const IconDoc = (p) => (
  <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Icon>
);
export const IconAlert = (p) => (
  <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 8v5M12 16.2v.2" /></Icon>
);
export const IconInbox = (p) => (
  <Icon {...p}><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.5 5h13l2.5 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z" /></Icon>
);
export const IconLogout = (p) => (
  <Icon {...p}><path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" /><path d="m17 15 3-3-3-3M20 12H10" /></Icon>
);
export const IconKey = (p) => (
  <Icon {...p}><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M15 12v2" /></Icon>
);
export const IconGrid = (p) => (
  <Icon {...p}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></Icon>
);
export const IconPhone = (p) => (
  <Icon {...p}><rect x="6.5" y="3" width="11" height="18" rx="2.5" /><path d="M11 18h2" /></Icon>
);
