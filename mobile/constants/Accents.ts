export type AccentColor = {
  id: string;
  value: string;
  label: string;
};

/** Same palette as Space Launcher settings. */
export const ACCENT_COLORS: AccentColor[] = [
  { id: 'white', value: '#FFFFFF', label: 'White' },
  { id: 'silver', value: '#B8B8C4', label: 'Silver' },
  { id: 'blue', value: '#3B82F6', label: 'Blue' },
  { id: 'indigo', value: '#6366F1', label: 'Indigo' },
  { id: 'purple', value: '#8B5CF6', label: 'Purple' },
  { id: 'magenta', value: '#D946EF', label: 'Magenta' },
  { id: 'pink', value: '#EC4899', label: 'Pink' },
  { id: 'rose', value: '#FB7185', label: 'Rose' },
  { id: 'red', value: '#EF4444', label: 'Red' },
  { id: 'orange', value: '#F97316', label: 'Orange' },
  { id: 'amber', value: '#F59E0B', label: 'Amber' },
  { id: 'gold', value: '#EAB308', label: 'Gold' },
  { id: 'lime', value: '#84CC16', label: 'Lime' },
  { id: 'green', value: '#22C55E', label: 'Green' },
  { id: 'teal', value: '#14B8A6', label: 'Teal' },
  { id: 'cyan', value: '#06B6D4', label: 'Cyan' },
];

export const DEFAULT_ACCENT_ID = 'cyan';

export function getAccentById(id: string | null | undefined): AccentColor {
  return ACCENT_COLORS.find((c) => c.id === id) || ACCENT_COLORS.find((c) => c.id === DEFAULT_ACCENT_ID)!;
}

export function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function accentDim(hex: string, alpha = 0.18): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function accentBorder(hex: string, alpha = 0.4): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
