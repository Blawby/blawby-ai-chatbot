import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  flattenExceptionFiles,
  INLINE_STYLE_EXCEPTION_FILES,
  SERIF_EXCEPTION_FILES,
} from '../../../scripts/lib/productShellStyleAudit.js';

const root = resolve(import.meta.dirname, '../../..');
const src = resolve(root, 'src');

const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  })
  .filter((path) => ['.css', '.ts', '.tsx'].includes(extname(path)));

const repoPath = (path: string): string => relative(root, path).replaceAll('\\', '/');

describe('product-shell style audit', () => {
  const files = sourceFiles(src);

  it('uses precise transition properties', () => {
    const offenders = files
      .filter((path) => readFileSync(path, 'utf8').includes('transition-all'))
      .map(repoPath);

    expect(offenders).toEqual([]);
  });

  it('keeps every inline style inside an explicit exception category', () => {
    const actual = files
      .filter((path) => extname(path) === '.tsx' && readFileSync(path, 'utf8').includes('style='))
      .map(repoPath)
      .sort();

    expect(actual).toEqual(flattenExceptionFiles(INLINE_STYLE_EXCEPTION_FILES));
  });

  it('keeps serif typography out of product working surfaces', () => {
    const serifPattern = /font-serif|family-name:var\(--serif\)|fontFamily:\s*['"]var\(--serif\)|font-family:\s*var\(--serif\)/;
    const actual = files
      .filter((path) => serifPattern.test(readFileSync(path, 'utf8')))
      .map(repoPath)
      .sort();

    expect(actual).toEqual(flattenExceptionFiles(SERIF_EXCEPTION_FILES));
  });
});
