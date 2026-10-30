import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const css = readFileSync('src/app/globals.css', 'utf8');
function luminance(hex: string) {
  if (hex.length === 4) hex = '#' + hex.slice(1).split('').map(channel => channel + channel).join('');
  const rgb = hex.replace('#', '').match(/../g)!.map(channel => parseInt(channel, 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a: string, b: string) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); }
function token(name: string) { const match = css.match(new RegExp(`--${name}:(#[a-f0-9]{3,6});`, 'i')); if (!match) throw new Error(`Missing token ${name}`); return match[1]; }
describe('contraste de los tokens Zenvik 2.0', () => {
  it.each([['foreground', 'background'], ['foreground', 'card'], ['muted-foreground', 'background'], ['primary-foreground', 'primary']])('%s sobre %s cumple 4.5:1', (text, background) => { expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(4.5); });
  it.each(['success', 'pending', 'muted', 'danger', 'info'])('badge %s cumple 4.5:1', tone => {
    const match = css.match(new RegExp(`\\.status-${tone} \\{ color:(#[a-f0-9]{6}); background:(#[a-f0-9]{6})`, 'i'));
    expect(match).not.toBeNull(); expect(contrast(match![1], match![2])).toBeGreaterThanOrEqual(4.5);
  });
});
