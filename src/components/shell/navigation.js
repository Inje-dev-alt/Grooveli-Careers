import {
  IconMap,
  IconBriefcase,
  IconTarget,
  IconSparkle,
  IconUser,
  IconHome,
  IconGrid,
} from '../ui/index.js';

/**
 * One navigation definition, used by the top bar, the bottom tab bar and the
 * menu drawer. Adding a destination is one entry.
 */
export const NAV_ITEMS = [
  { to: '/city', label: 'City', icon: IconMap },
  { to: '/jobs', label: 'Jobs', icon: IconBriefcase },
  { to: '/missions', label: 'Missions', icon: IconTarget },
  { to: '/network', label: 'Network', icon: IconGrid },
  { to: '/ai', label: 'AI Center', icon: IconSparkle },
  { to: '/profile', label: 'Profile', icon: IconUser },
  { to: '/apartment', label: 'Apartment', icon: IconHome, menuOnly: true },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((item) => !item.menuOnly);

/** The tab bar has room for five; the rest stay in the menu. */
export const COMPACT_NAV = PRIMARY_NAV.filter((item) => item.to !== '/ai');
