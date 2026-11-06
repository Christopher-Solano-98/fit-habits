import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { HELP } from '../src/lib/help';

describe('in-app help', () => {
  const ids = HELP.flatMap((s) => s.topics.map((t) => t.id));
  it('has unique topic ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every ? button opens a topic that exists', () => {
    const src = readdirSync('src/screens').map((f) => readFileSync(`src/screens/${f}`, 'utf8')).join('\n');
    const used = [...src.matchAll(/(?:help|topic)=["']([\w-]+)["']/g), ...src.matchAll(/'([\w-]+)'(?=[,}])/g)]
      .map((m) => m[1])
      .filter((id) => ids.includes(id) || /help|topic/.test(id) === false);
    const referenced = [...src.matchAll(/(?:help|topic)="([\w-]+)"/g)].map((m) => m[1]);
    const fromMap = [...src.matchAll(/\{ info: '([\w-]+)', pay: '([\w-]+)', workouts: '([\w-]+)', progress: '([\w-]+)', files: '([\w-]+)' \}/g)].flatMap((m) => m.slice(1));
    const fromForm = [...src.matchAll(/help=\{existing \? '([\w-]+)' : '([\w-]+)'\}/g)].flatMap((m) => m.slice(1));
    const all = [...referenced, ...fromMap, ...fromForm];
    expect(all.length).toBeGreaterThan(12);
    for (const id of all) expect(ids).toContain(id);
    expect(used.length).toBeGreaterThan(0);
  });
});
