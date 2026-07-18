/** Deep Space palette — aligned with Space Launcher / marketing. */
export const SpaceColors = {
  bg: '#08080A',
  bgElevated: '#0b1220',
  bgPanel: 'rgba(11, 18, 32, 0.72)',
  bgPanelSolid: '#12151f',
  border: 'rgba(255, 255, 255, 0.12)',
  text: '#F4F6FA',
  textMuted: 'rgba(244, 246, 250, 0.62)',
  accent: '#22d3ee',
  accentDim: 'rgba(34, 211, 238, 0.18)',
  danger: '#f87171',
  ok: '#34d399',
  star: 'rgba(255, 255, 255, 0.55)',
};

const Colors = {
  light: {
    text: SpaceColors.text,
    background: SpaceColors.bg,
    tint: SpaceColors.accent,
    tabIconDefault: SpaceColors.textMuted,
    tabIconSelected: SpaceColors.accent,
  },
  dark: {
    text: SpaceColors.text,
    background: SpaceColors.bg,
    tint: SpaceColors.accent,
    tabIconDefault: SpaceColors.textMuted,
    tabIconSelected: SpaceColors.accent,
  },
};

export default Colors;
