import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const sizeOf = (file) => fs.statSync(path.join(root, file)).size;

const locales = {
  en: JSON.parse(read('locale/en.json')),
  zh: JSON.parse(read('locale/zh.json')),
};

test('every locale ships a title, a description and a detail document', () => {
  for (const [lang, doc] of Object.entries(locales)) {
    assert.equal(typeof doc.meta?.title, 'string', `${lang}: meta.title`);
    assert.ok(doc.meta.title.trim().length > 0, `${lang}: meta.title is empty`);
    assert.ok(doc.meta.title.includes('dsh-turn-sieve'), `${lang}: title names the plugin`);
    assert.equal(typeof doc.meta?.description, 'string', `${lang}: meta.description`);
    assert.ok(doc.meta.description.trim().length > 200, `${lang}: meta.description is too short`);
    assert.equal(typeof doc.meta?.detail, 'string', `${lang}: meta.detail`);
  }
  assert.equal(locales.en.meta.detail, 'docs/DETAIL.md');
  assert.equal(locales.zh.meta.detail, 'docs/DETAIL.zh.md');
  assert.notEqual(locales.en.meta.description, locales.zh.meta.description);
});

test('each declared detail document exists, is small and holds exactly one image', () => {
  for (const [lang, doc] of Object.entries(locales)) {
    const detail = doc.meta.detail;
    assert.ok(/\.(md|markdown)$/.test(detail), `${lang}: detail ends in .md or .markdown`);
    assert.ok(!detail.startsWith('/') && !detail.includes('\\') && !detail.startsWith('..'), `${lang}: detail stays inside the package`);
    assert.ok(exists(detail), `${lang}: ${detail} exists`);
    assert.ok(sizeOf(detail) < 1024 * 1024, `${lang}: detail stays under pluginManager.detailMaxBytes`);

    const text = read(detail);
    const lines = text.split('\n').filter((line) => line.trim() !== '');
    assert.equal(lines.length, 1, `${lang}: the detail document is one image line, no headings or install steps`);
    assert.ok(!text.includes('#'), `${lang}: no heading in the detail document`);

    const image = lines[0].match(/^!\[([^\]]+)\]\(([^)]+)\)$/);
    assert.ok(image, `${lang}: the single line is a markdown image`);
    assert.ok(image[1].trim().length > 20, `${lang}: alternative text describes the feature`);
    const target = path.posix.join(path.posix.dirname(detail), image[2]);
    assert.ok(exists(target), `${lang}: ${target} exists beside the document`);
  }
});

test('both locales share one text-free preview illustration', () => {
  const images = Object.values(locales).map((doc) => {
    const detail = doc.meta.detail;
    const line = read(detail).split('\n').find((entry) => entry.startsWith('!['));
    return path.posix.join(path.posix.dirname(detail), line.match(/\(([^)]+)\)/)[1]);
  });
  assert.deepEqual(images, ['docs/preview.svg', 'docs/preview.svg']);

  const svg = read('docs/preview.svg');
  assert.ok(sizeOf('docs/preview.svg') < 1024 * 1024, 'preview stays far below the 5 MiB image limit');
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'self-contained svg namespace');
  assert.ok(svg.includes('width="640"'), '640 canvas units wide');
  assert.ok(svg.includes('height="300"'), '300 canvas units high');
  assert.ok(svg.includes('viewBox="0 0 640 300"'), 'matching viewBox');
  for (const forbidden of ['<text', '<script', '<style', 'foreignObject', '<image', 'xlink:href', '@import', 'href=']) {
    assert.ok(!svg.includes(forbidden), `preview.svg avoids ${forbidden}`);
  }
  assert.ok(!svg.replace('xmlns="http://www.w3.org/2000/svg"', '').includes('http'), 'no remote resources');
  assert.ok(svg.includes('fill-opacity') && svg.includes('#3f7dfa'), 'translucent neutrals plus one accent readable on both themes');
});

test('the English readme mirrors the Chinese one', () => {
  const en = read('README.en.md');
  const zh = read('README.md');
  assert.ok(en.startsWith('# dsh-turn-sieve'), 'English readme keeps the package title');
  assert.ok(en.includes('[中文 README](README.md)'), 'English readme links back to Chinese');
  assert.ok(zh.includes('[English README](README.en.md)'), 'Chinese readme links to English');
  for (const heading of ['## Installation', '## Usage', '## The two modes', '## Undo', '## Safety boundaries', '## How it works', '## Agent tool', '## Appearance and motion', '## Limitations', '## Changelog', '## Development', '## License']) {
    assert.ok(en.includes(heading), `English readme has ${heading}`);
  }
  assert.ok(en.length > 8000, 'English readme is a real translation, not a stub');
});

test('both readmes document the format-v4 marker coordinates', () => {
  for (const file of ['README.md', 'README.en.md']) {
    const text = read(file);
    assert.ok(!/step: 0,/.test(text), `${file}: no stale step: 0 sample`);
    assert.ok(text.includes('step: index + 1'), `${file}: documents the positive step`);
  }
});

test('the manifest packages the docs and both readmes', () => {
  const manifest = JSON.parse(read('package.json'));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  for (const entry of ['lib', 'locale', 'docs', 'cordis.patch.yml', 'README.md', 'README.en.md', 'LICENSE']) {
    assert.ok(manifest.files.includes(entry), `files lists ${entry}`);
    assert.ok(exists(entry), `${entry} exists on disk`);
  }
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json');
});
