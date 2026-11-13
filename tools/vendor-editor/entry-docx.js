/* docx, which writes Word files for Sleek Docs (doc/word.js), as one global: window.SleekDocx.
   Loaded only when a page is saved as a Word file. */
import * as docx from 'docx';
window.SleekDocx = docx;
