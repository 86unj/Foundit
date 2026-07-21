/**
 * Shared bg.svg fill. `cover` always fills the viewport (avoids empty bands
 * on tall windows that percentage sizes caused).
 */
export const PAGE_BACKGROUND_PROPS = {
  backgroundImage: "url('/bg.svg')",
  backgroundRepeat: 'no-repeat',
  backgroundSize: 'cover',
  backgroundPosition: {
    base: '44% 52%',
    md: '38% 46%',
    xl: '34% 42%',
  },
} as const;
