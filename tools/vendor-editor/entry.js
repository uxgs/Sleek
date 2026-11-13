/* Everything Sleek Docs uses from ProseMirror, gathered under one global, window.SleekPM.
   Anything that checks "is this a ProseMirror node?" must come from this same file, so add-ons
   (writing together, later) are added here and the file rebuilt, never loaded beside it. */
import * as model from 'prosemirror-model';
import * as state from 'prosemirror-state';
import * as view from 'prosemirror-view';
import * as transform from 'prosemirror-transform';
import * as commands from 'prosemirror-commands';
import * as keymap from 'prosemirror-keymap';
import * as history from 'prosemirror-history';
import * as inputrules from 'prosemirror-inputrules';
import * as schemaList from 'prosemirror-schema-list';
import * as dropcursor from 'prosemirror-dropcursor';
import * as gapcursor from 'prosemirror-gapcursor';
import * as tables from 'prosemirror-tables';

window.SleekPM = { model, state, view, transform, commands, keymap, history, inputrules, schemaList, dropcursor, gapcursor, tables };
