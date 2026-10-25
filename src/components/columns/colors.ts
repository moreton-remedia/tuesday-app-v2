export const PALETTE = [
  { key: 'gray', hex: '#868e96' },
  { key: 'blue', hex: '#4263eb' },
  { key: 'teal', hex: '#1098ad' },
  { key: 'green', hex: '#37b24d' },
  { key: 'lime', hex: '#74b816' },
  { key: 'yellow', hex: '#f59f00' },
  { key: 'orange', hex: '#f76707' },
  { key: 'red', hex: '#e03131' },
  { key: 'pink', hex: '#d6336c' },
  { key: 'purple', hex: '#ae3ec9' },
] as const;

export type ColorKey = (typeof PALETTE)[number]['key'];

export function getColor(colorKey: string | undefined | null): string {
  if (!colorKey) return '#495057';
  return PALETTE.find(p => p.key === colorKey)?.hex ?? '#495057';
}

export function slugify(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
