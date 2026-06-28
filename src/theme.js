// ── Darsi Greens — shared design tokens ──────────────────────────────────────
// One source of truth for colour, spacing, radius, shadow and type so every
// screen feels like the same product. Brand identity stays dark-green.

export const colors = {
  // Brand greens
  headerBg:  '#1a472a',  // dark green header
  primary:   '#2d6a4f',  // primary actions / accents
  primaryDk: '#143a22',
  primaryLt: '#e8f5ec',  // soft green surface
  accent:    '#52b788',

  // Semantic
  paid:      '#0f5132',
  paidBg:    '#d1e7dd',
  pending:   '#8a6d12',
  pendingBg: '#fff3cd',
  danger:    '#e74c3c',
  dangerBg:  '#fdecea',
  warn:      '#f6a623',

  // Surfaces
  screenBg:  '#f1f7f2',
  card:      '#ffffff',
  divider:   '#eef3ee',

  // Text
  text:      '#1a472a',
  textMuted: '#5b6b60',
  textFaint: '#8a978d',
  onDark:    '#ffffff',
  subOnDark: '#a8d5b5',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

// Soft, consistent card elevation (green-tinted shadow)
export const shadow = {
  card: {
    elevation: 2,
    shadowColor: '#1a472a',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  floating: {
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
};

// Type scale raised for low-literacy users — nothing below 13.
export const font = {
  h1: 30, h2: 24, h3: 20, body: 18, small: 15, tiny: 13,
  heroNum: 40, // big stat number (profit, stock remaining, etc.)
};

// Minimum comfortable touch target for big fingers / shaky hands.
export const touch = { min: 56 };

// Shared date helpers (Telugu weekday + friendly date) used by AppHeader
const TE_DAYS   = ['ఆదివారం', 'సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function teluguDay(d = new Date())   { return TE_DAYS[d.getDay()]; }
export function friendlyDate(d = new Date()) { return `${d.getDate()} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
