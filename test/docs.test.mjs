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
  for (const heading of ['## Installation', '## Usage', '## The two modes', '## Undo', '## Safety boundaries', '## How it works', '## Agent tool', '## Appearance and effects', '## Limitations', '## Changelog', '## Development', '## A note from the author', '## Feedback', '## License']) {
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
  assert.equal(manifest.engines.dsh, '>=0.2.2-rc.3', 'the engine floor follows the verified host');
  assert.equal(manifest.engines.node, '>=24.9.0');
  assert.ok(!manifest.dependencies && !manifest.peerDependencies, 'stays dependency-free');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml', 'declares dsh.bundle (market requirement)');
});

test('the manifest version matches the newest changelog entry', () => {
  const manifest = JSON.parse(read('package.json'));
  const rank = (value) => value.split('.').map(Number);
  const newest = (text) => [...text.matchAll(/\*\*(\d+\.\d+\.\d+)\*\*/g)]
    .map((match) => match[1])
    .sort((a, b) => {
      const [x, y] = [rank(a), rank(b)];
      return (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);
    })
    .at(-1);
  for (const file of ['README.md', 'README.en.md']) {
    assert.equal(newest(read(file)), manifest.version, `${file}: changelog head matches package.json`);
  }
});

test('both readmes document the verified host floor and the 0.7.3 changelog', () => {
  for (const file of ['README.md', 'README.en.md']) {
    const text = read(file);
    assert.ok(text.includes('0.2.2-rc.3'), `${file}: names the rc.3 floor`);
    assert.ok(text.includes('0.2.2-rc.5'), `${file}: names the rc.5 verification`);
    assert.ok(!text.includes('0.2.2-rc.2'), `${file}: drops the rc.2 floor`);
    assert.ok(/\*\*0\.7\.3\*\*/.test(text), `${file}: has a 0.7.3 changelog entry`);
  }
});

test('both readmes describe a host-native panel with no effects switch', () => {
  const heads = { 'README.md': '## 外观与特效', 'README.en.md': '## Appearance and effects' };
  for (const [file, head] of Object.entries(heads)) {
    const text = read(file);
    assert.ok(/\*\*0\.7\.4\*\*/.test(text), `${file}: keeps the 0.7.4 changelog entry`);
    const start = text.indexOf(head);
    assert.ok(start >= 0, `${file}: has the appearance section`);
    const section = text.slice(start, text.indexOf('\n## ', start + head.length));
    // The switch is gone: naming its key would send readers hunting for a control
    // that no longer exists. The section may still talk about effects, but only to
    // say they are paused — never as something the reader can turn on.
    assert.ok(!section.includes('dts-effects'), `${file}: does not name the retired effects key`);
    // "switching views" is fine; a switch the reader could flip is not.
    assert.ok(!/「特效」开关|Effects switch/.test(section), `${file}: does not promise an effects switch`);
    assert.ok(/暂时关闭|paused for now/.test(section), `${file}: says the effects work is paused`);
    assert.ok(/邮箱|email/i.test(section), `${file}: invites ideas by email`);
    // Describing the token is fine; offering a blur is not, since nothing can turn
    // one on and the "no backdrop blur" promise would contradict the section.
    assert.ok(!/blur\(\d+px\)/.test(section), `${file}: no blur radius left to describe`);
    assert.ok(!/液态玻璃|liquid glass|liquid-glass/i.test(section), `${file}: the section stops promising liquid glass`);
    assert.ok(/content-visibility/.test(section), `${file}: keeps the long-list note`);
  }
});

test('both readmes end with an author note and a separate feedback section', () => {
  const heads = {
    'README.md': { note: '## 作者的话', feedback: '## 反馈', changelog: '## 更新记录' },
    'README.en.md': { note: '## A note from the author', feedback: '## Feedback', changelog: '## Changelog' },
  };
  for (const [file, head] of Object.entries(heads)) {
    const text = read(file);
    const note = text.indexOf(head.note);
    const feedback = text.indexOf(head.feedback);
    const license = text.indexOf('## License');
    assert.ok(note >= 0, `${file}: has the author note`);
    assert.ok(feedback >= 0, `${file}: has the feedback section`);
    // Two sections, in this order, both after the changelog and before the license.
    assert.ok(note > text.indexOf(head.changelog), `${file}: the author note sits after the changelog`);
    assert.ok(feedback > note, `${file}: feedback follows the author note`);
    assert.ok(feedback < license, `${file}: feedback sits before the license`);
    const noteText = text.slice(note, feedback);
    const feedbackText = text.slice(feedback, license);
    assert.ok(/学生|student/i.test(noteText), `${file}: the note says who is maintaining it`);
    assert.ok(!/microguyou@outlook.com/.test(noteText), `${file}: the address belongs to the feedback section`);
    assert.ok(/bug/i.test(noteText), `${file}: the note owns the rough-edges admission`);
    assert.ok(feedbackText.includes('microguyou@outlook.com'), `${file}: feedback publishes the contact address`);
    assert.ok(/合作|collaborat/i.test(feedbackText), `${file}: feedback invites collaboration`);
  }
});

test('nothing published names the visual reference', () => {
  for (const file of ['package.json', 'locale/zh.json', 'locale/en.json', 'README.md', 'README.en.md', 'docs/DETAIL.md', 'docs/DETAIL.zh.md']) {
    assert.ok(!/dsh-our-free-model|Ebony-Vinyl|ofm_|free-model/i.test(read(file)), `${file}: keeps the reference private`);
  }
  for (const file of ['package.json', 'locale/zh.json', 'locale/en.json', 'docs/DETAIL.md', 'docs/DETAIL.zh.md']) {
    assert.ok(!/液态玻璃|liquid glass|liquid-glass/i.test(read(file)), `${file}: drops the liquid-glass wording`);
  }
});

test('both readmes carry the CI, npm, licence, host and market badges', () => {
  const workflow = '.github/workflows/ci.yml';
  assert.ok(exists(workflow), 'the CI workflow must exist, otherwise the CI badge renders as "no status"');
  const ci = read(workflow);
  assert.match(ci, /npm test/, 'CI must actually run the suite');
  assert.match(ci, /node-version:\s*\$\{\{\s*matrix\.node\s*\}\}/, 'CI must pin the Node version through the matrix');
  assert.match(ci, /node:\s*\[24\]/, 'CI must run on Node 24, the floor this plugin needs');

  for (const file of ['README.md', 'README.en.md']) {
    const text = read(file);
    assert.match(text, /actions\/workflows\/ci\.yml\/badge\.svg/, `${file}: CI badge`);
    assert.match(text, /img\.shields\.io\/npm\/v\/dsh-turn-sieve/, `${file}: npm badge`);
    assert.match(text, /License-MIT/, `${file}: MIT badge`);
    assert.match(text, /badge\/DSH-0\.2\.2--rc\.5/, `${file}: DSH badge`);
    assert.match(text, /node-%E2%89%A524\.9\.0/, `${file}: Node badge`);
    assert.match(text, /dshmarket-listed/, `${file}: market badge`);
    // The badges must sit directly under the title, before the language switch.
    const head = text.split('\n').slice(0, 12).join('\n');
    assert.match(head, /badge\.svg/, `${file}: badges belong under the title`);
  }
});

test('both readmes document the release-age troubleshooting path', () => {
  const files = {
    'README.md': '## 故障排查：更新其他插件时报 release-age 错误',
    'README.en.md': '## Troubleshooting: a release-age error while updating another plugin',
  };
  for (const [file, heading] of Object.entries(files)) {
    const text = read(file);
    assert.ok(text.includes(heading), `${file}: troubleshooting heading`);
    assert.ok(text.includes('scripts/check-release-age.mjs'), `${file}: diagnostic path`);
    assert.ok(text.includes('minimumReleaseAgeExclude'), `${file}: the yaml key to edit`);
    assert.ok(text.includes('--config.minimum-release-age=0'), `${file}: the one-shot bypass`);
    assert.ok(text.includes('link:'), `${file}: must explain why a linked plugin is exempt`);
  }
});

test('the release-age diagnostic ships and imports only node builtins', () => {
  const manifest = JSON.parse(read('package.json'));
  assert.ok(manifest.files.includes('scripts'), 'files must ship scripts/');
  const script = read('scripts/check-release-age.mjs');
  assert.match(script, /minimumReleaseAgeExclude/, 'the script must name the setting it edits');
  assert.match(script, /registry\.npmjs\.org/, 'the script must query npm publish times');
  assert.ok(script.includes('/^(link|file|workspace):/'), 'the script must skip local dependencies');
  const imports = [...script.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  assert.ok(imports.length > 0, 'the script must import node builtins');
  for (const specifier of imports) {
    assert.match(specifier, /^node:/, `only node: builtins are allowed, found ${specifier}`);
  }
});
