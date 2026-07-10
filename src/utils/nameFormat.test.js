import { theName } from './nameFormat';

describe('theName', () => {
  it('adds the article when the name lacks one', () => {
    expect(theName('Rimefang Peaks')).toBe('The Rimefang Peaks');
    expect(theName('Grey Moors')).toBe('The Grey Moors');
  });

  it('does not double the article when the name already starts with "The"', () => {
    expect(theName('The Rimefang Peaks')).toBe('The Rimefang Peaks');
  });

  it('collapses an already-doubled article back to a single "The"', () => {
    expect(theName('The The Rimefang Peaks')).toBe('The Rimefang Peaks');
    expect(theName('the The Rimefang Peaks')).toBe('The Rimefang Peaks');
  });

  it('is case-insensitive about the existing article', () => {
    expect(theName('the Rimefang Peaks')).toBe('The Rimefang Peaks');
    expect(theName('THE Rimefang Peaks')).toBe('The Rimefang Peaks');
  });

  it('tolerates empty / nullish input', () => {
    expect(theName('')).toBe('');
    expect(theName('   ')).toBe('');
    expect(theName(null)).toBe('');
    expect(theName(undefined)).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(theName('  Rimefang Peaks  ')).toBe('The Rimefang Peaks');
  });
});
