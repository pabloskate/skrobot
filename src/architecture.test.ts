import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const FEATURES_ROOT = resolve(ROOT, 'src/features');
const MOBILE_ROOT = resolve(ROOT, 'apps/mobile');

const ALLOWED_FEATURE_IMPORTS: Record<string, readonly string[]> = {
  analytics: [],
  auth: [],
  billing: [],
  gallery: ['records', 'robots', 'skater', 'tricks'],
  game: ['records', 'robots', 'tricks'],
  home: ['records', 'robots', 'skater'],
  install: [],
  records: ['tricks'],
  robots: ['records', 'tricks'],
  skater: ['records', 'robots', 'tricks'],
  tricks: [],
  voice: ['auth', 'billing', 'game', 'records', 'robots', 'tricks'],
};

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  const skippedDirectories = new Set(['node_modules', '.expo', 'android', 'ios']);
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
    }
  };
  visit(root);
  return files;
}

function importsIn(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return ts.preProcessFile(source, true, true).importedFiles.map((item) => item.fileName);
}

function featureFromResolvedPath(path: string): string | null {
  const withinFeatures = relative(FEATURES_ROOT, path);
  if (withinFeatures.startsWith('..') || withinFeatures.startsWith(sep)) return null;
  return withinFeatures.split(sep)[0] ?? null;
}

function featureTarget(file: string, specifier: string): { feature: string; deep: boolean; relative: boolean } | null {
  const alias = specifier.match(/^@\/features\/([^/]+)(\/.*)?$/);
  if (alias) return { feature: alias[1], deep: Boolean(alias[2]), relative: false };
  if (!specifier.startsWith('.')) return null;
  const feature = featureFromResolvedPath(resolve(dirname(file), specifier));
  return feature ? { feature, deep: true, relative: true } : null;
}

describe('architecture import graph', () => {
  it('covers every feature directory and enforces exact barrel dependencies', () => {
    const directories = readdirSync(FEATURES_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(Object.keys(ALLOWED_FEATURE_IMPORTS).sort()).toEqual(directories);

    const violations: string[] = [];
    for (const file of sourceFiles(FEATURES_ROOT)) {
      const sourceFeature = featureFromResolvedPath(file);
      if (!sourceFeature) continue;
      for (const specifier of importsIn(file)) {
        const target = featureTarget(file, specifier);
        if (!target) continue;
        const location = relative(ROOT, file);
        if (target.feature === sourceFeature) {
          if (!target.relative) violations.push(`${location}: import within a feature must be relative (${specifier})`);
          continue;
        }
        if (target.relative || target.deep) {
          violations.push(`${location}: cross-feature imports must use @/features/${target.feature} (${specifier})`);
          continue;
        }
        if (!ALLOWED_FEATURE_IMPORTS[sourceFeature]?.includes(target.feature)) {
          violations.push(`${location}: ${sourceFeature} may not depend on ${target.feature}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps the native parity shell independent from web source', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(MOBILE_ROOT)) {
      for (const specifier of importsIn(file)) {
        const resolved = specifier.startsWith('.') ? resolve(dirname(file), specifier) : '';
        if (specifier.startsWith('@/') || (resolved && relative(resolve(ROOT, 'src'), resolved).split(sep)[0] !== '..')) {
          violations.push(`${relative(ROOT, file)} imports web source through ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('prevents app, platform, and shared code from reaching features by relative path', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(resolve(ROOT, 'src'))) {
      if (featureFromResolvedPath(file)) continue;
      for (const specifier of importsIn(file)) {
        if (!specifier.startsWith('.')) continue;
        const targetFeature = featureFromResolvedPath(resolve(dirname(file), specifier));
        if (targetFeature) {
          violations.push(`${relative(ROOT, file)} reaches ${targetFeature} through ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
