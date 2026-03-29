import { describe, expect, it } from 'vitest';
import { historyCreateSchema, historyUpdateSchema, parseHistoryId } from '../lib/history-validation';

describe('history validation', () => {
  it('accepts valid create payload', () => {
    const parsed = historyCreateSchema.safeParse({
      word: 'serendipity',
      phonetic: '',
      meaning: 'a pleasant surprise',
      sentence: '',
      sentence_cn: '',
      imageUrl: '',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects blank word', () => {
    const parsed = historyCreateSchema.safeParse({
      word: '   ',
      meaning: 'x',
    });

    expect(parsed.success).toBe(false);
  });

  it('requires positive integer id for update', () => {
    const parsed = historyUpdateSchema.safeParse({
      id: 0,
      word: 'hello',
      meaning: 'world',
    });

    expect(parsed.success).toBe(false);
  });

  it('parses numeric ids and rejects invalid input', () => {
    expect(parseHistoryId('42')).toBe(42);
    expect(parseHistoryId('x42')).toBeNull();
    expect(parseHistoryId(null)).toBeNull();
  });
});
