/** Role-specific defaults. Optical tint, readable content and scrim stay independent. */
export const DIALOG_PRESET = Object.freeze({
  glass: Object.freeze({
    mode: 'zoned',
    blur: 2,
    strength: 17,
    edge: 22,
    tint: '#0a121a',
    opacity: .40,
  }),
  contentWash: .61,
  scrimOpacity: .30,
});
