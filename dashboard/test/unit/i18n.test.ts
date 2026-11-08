import { describe, it, expect } from 'vitest';
import { getAllKeys } from '@/lib/i18n';

describe('i18n', () => {
  it('en.json and am.json have identical key sets', async () => {
    const [en, am] = await Promise.all([getAllKeys('en'), getAllKeys('am')]);
    const missingInAm = en.filter((k) => !am.includes(k));
    const missingInEn = am.filter((k) => !en.includes(k));
    expect(missingInAm, 'Keys in en.json missing from am.json').toEqual([]);
    expect(missingInEn, 'Keys in am.json missing from en.json').toEqual([]);
  });
});