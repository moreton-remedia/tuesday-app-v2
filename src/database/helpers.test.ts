import { describe, expect, test } from 'bun:test';
import { selectOne } from './helpers';

describe('selectOne', () => {
  test('returns the first row', async () => {
    await expect(selectOne(Promise.resolve([{ id: 'first' }, { id: 'second' }]))).resolves.toEqual({
      id: 'first',
    });
  });

  test('returns null for empty result sets', async () => {
    await expect(selectOne(Promise.resolve([]))).resolves.toBeNull();
  });
});

