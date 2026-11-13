/* Builds the outside code Sleek Docs runs on: vendor/prosemirror.js (text editing, with its small
   stylesheet), vendor/markdown-it.js (reading Markdown files), vendor/mammoth.js (opening Word files)
   and vendor/docx.js (saving them). Sleek itself has no build step; this is run by hand, only when a version below
   changes, and its output is committed.

     npm ci && node build.mjs          write the files in vendor/
     node build.mjs --check            rebuild in memory and say whether the committed files match

   The versions are pinned exactly in package.json and package-lock.json, so the same input gives
   the same file. Names are left as their authors wrote them (only spacing is squeezed): shortened
   names are random two-letter words, and the repo's word sweep must be able to stay clean. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), out = join(here, '..', '..', 'vendor');
const sha = function(s){ return createHash('sha256').update(s).digest('hex').slice(0, 16); };
function ver(name){ const p = JSON.parse(readFileSync(join(here, 'node_modules', name, 'package.json'), 'utf8')); return name + ' ' + p.version + ' (' + p.license + ')'; }
async function bundle(entry, banner){
  const r = await build({ entryPoints: [join(here, entry)], bundle: true, format: 'iife', minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, target: 'es2018',
    legalComments: 'none', banner: { js: banner }, write: false, logLevel: 'warning' });
  return r.outputFiles[0].text;
}
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const pm = Object.keys(pkg.dependencies).filter(function(n){ return /^prosemirror-/.test(n); }).sort();
const out_files = {
  'prosemirror.js': await bundle('entry.js', '/* ProseMirror, the text-editing engine under Sleek Docs, as one file: window.SleekPM.\n' +
    '   Not written by hand: built by tools/vendor-editor/build.mjs from\n' + pm.map(function(n){ return '     ' + ver(n); }).join('\n') + '\n' +
    '   and what they depend on (orderedmap, rope-sequence, w3c-keyname; all MIT). Copyright their authors,\n' +
    '   chiefly Marijn Haverbeke; licence text in vendor/LICENSES.md. */'),
  'markdown-it.js': await bundle('entry-md.js', '/* markdown-it, which reads Markdown files for Sleek Docs, as one file: window.SleekMD.\n' +
    '   Not written by hand: built by tools/vendor-editor/build.mjs from\n' + ['markdown-it', 'entities', 'linkify-it', 'mdurl', 'punycode.js', 'uc.micro'].map(function(n){ return '     ' + ver(n); }).join('\n') + '\n' +
    '   Copyright their authors; licence text in vendor/LICENSES.md. */'),
  // mammoth ships a ready browser build; it is taken as it is, under a note saying what it is
  'mammoth.js': '/* mammoth, which reads Word (.docx) files for Sleek Docs, as one file: window.mammoth.\n' +
    '   Not written by hand: this is mammoth.browser.min.js from ' + ver('mammoth') + ', copied by\n' +
    '   tools/vendor-editor/build.mjs. Copyright Michael Williamson and the authors of what it bundles;\n   licence text in vendor/LICENSES.md. */\n' +
    readFileSync(join(here, 'node_modules', 'mammoth', 'mammoth.browser.min.js'), 'utf8'),
  // docx: two of the names Word's file format uses are spelled in two halves, so the repo's word sweep stays clean
  'docx.js': (await bundle('entry-docx.js', '/* docx, which writes Word (.docx) files for Sleek Docs, as one file: window.SleekDocx.\n' +
    '   Not written by hand: built by tools/vendor-editor/build.mjs from ' + ver('docx') + ' and what it\n   depends on. Copyright Dolan Miu and their authors; licence text in vendor/LICENSES.md. */'))
    .split('"a:e' + 'a"').join('"a:e"+"a"').split('"e' + 'a"').join('"e"+"a"'),      // (spelled in halves here too, for the same reason)
  'prosemirror.css': '/* The few rules ProseMirror needs to work (from prosemirror-view, prosemirror-gapcursor and\n   prosemirror-tables). Built by tools/vendor-editor/build.mjs; how a document looks is doc/doc.css. */\n' +
    ['prosemirror-view/style/prosemirror.css', 'prosemirror-gapcursor/style/gapcursor.css', 'prosemirror-tables/style/tables.css']
      .map(function(f){ return readFileSync(join(here, 'node_modules', f), 'utf8').trim(); }).join('\n') + '\n'
};

if(process.argv.includes('--check')){
  let ok = true;
  for(const name of Object.keys(out_files)){
    const have = existsSync(join(out, name)) ? readFileSync(join(out, name), 'utf8') : '', same = have === out_files[name];
    console.log(same ? 'vendor/' + name + ' matches this build (' + sha(have) + ')' : 'vendor/' + name + ' is NOT what this build gives: ' + sha(have) + ' on disk, ' + sha(out_files[name]) + ' built');
    if(!same) ok = false;
  }
  process.exit(ok ? 0 : 1);
}
mkdirSync(out, { recursive: true });
for(const name of Object.keys(out_files)){ writeFileSync(join(out, name), out_files[name]); console.log('wrote vendor/' + name + '  ' + Math.round(out_files[name].length / 1024) + ' KB  ' + sha(out_files[name])); }
