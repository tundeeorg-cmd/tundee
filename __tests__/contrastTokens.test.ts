/**
 * The text-contrast tokens (app/globals.css --tx-*) must stay WCAG AA (≥ 4.5:1) on
 * every background the /start flow puts them on, in both themes. Fast guard for what
 * npm run test:visual checks in a browser.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { keepTimeTogether } from '@/lib/landing/headline';
import { CHOICE_IDLE, CHOICE_SELECTED } from '@/lib/ui/choice';

const css = readFileSync('app/globals.css', 'utf8');
const block = (sel: string) => {
  const i = css.indexOf(`${sel} {\n  --tx-muted`);
  return css.slice(i, css.indexOf('}', i));
};
const tokens = (sel: string) => Object.fromEntries(
  Array.from(block(sel).matchAll(/--tx-([\w-]+):\s+(\d+) (\d+) (\d+);/g)).map((m) => [m[1], [+m[2], +m[3], +m[4]]]),
) as Record<string, number[]>;

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const LIGHT_BG = ['#FFFFFF', '#F5F7FA', '#F0F4F9'];
const DARK_BG = ['#07111F', '#0A1628', '#0D1F35', '#16263F', '#162552', '#1A2440', '#232B3E'];

describe('contrast tokens', () => {
  const light = tokens(':root');
  const dark = tokens('.dark');

  it('defines the seven tokens in both themes', () => {
    const names = ['muted', 'subtle', 'warning', 'nav-active', 'nav-inactive', 'chip', 'label-accent'];
    expect(Object.keys(light).sort()).toEqual([...names].sort());
    expect(Object.keys(dark).sort()).toEqual([...names].sort());
  });

  it.each(Object.keys(tokens(':root')))('%s ≥ 4.5:1 on every light background', (name) => {
    for (const bg of LIGHT_BG) expect(ratio(light[name], hex(bg)), `${name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.keys(tokens('.dark')))('%s ≥ 4.5:1 on every dark background', (name) => {
    for (const bg of DARK_BG) expect(ratio(dark[name], hex(bg)), `${name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it('native controls follow the theme', () => {
    expect(css).toContain('html.dark { color-scheme: dark; }');
  });
});

describe('choice buttons', () => {
  it('selected is a solid fill with a ✓, in both themes — not a slightly lighter navy', () => {
    expect(CHOICE_SELECTED).toContain('bg-[#1B3A6B]');
    expect(CHOICE_SELECTED).toContain('dark:bg-[#8FB4FF]');
    expect(CHOICE_SELECTED).toContain("before:content-['✓']");
    expect(CHOICE_IDLE).not.toContain('✓');
  });

  it('Tailwind scans lib/, where these class strings live', () => {
    expect(readFileSync('tailwind.config.ts', 'utf8')).toContain('"./lib/**/*.{js,ts,jsx,tsx}"');
  });
});

describe('the headline keeps "ใน 2 นาที" on one line', () => {
  it('joins the phrase with no-break spaces and leaves the copy otherwise unchanged', () => {
    const h = 'หาทุนการศึกษาที่คุณมีสิทธิ์ ใน 2 นาที';
    expect(keepTimeTogether(h)).toBe('หาทุนการศึกษาที่คุณมีสิทธิ์ ใน 2 นาที');
    expect(keepTimeTogether(h).replace(/ /g, ' ')).toBe(h);
  });
});
