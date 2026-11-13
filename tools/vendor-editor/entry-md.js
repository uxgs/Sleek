/* markdown-it, which turns a Markdown file into HTML for Sleek Docs to read (doc/import.js), as
   one global: window.SleekMD. Loaded only when a Markdown file is opened. */
import MarkdownIt from 'markdown-it';
window.SleekMD = MarkdownIt;
