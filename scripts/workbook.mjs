// The user's training-plan workbook, read the way the import needs it: the Drill Library rows from its CSV export, and which
// drills are red from its xlsx export. Red is a cell fill on Drill Name, Instructions or Demo Video, and the CSV loses fills.
import { inflateRawSync } from 'node:zlib';

export const SHEET_ID = '1XKrHlLgecjkVEpQ7SaUdvNnbQwKlk7dqkOnJm6PhQ8U';
export const LIBRARY_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=696354852`;
export const BOOK_XLSX = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
/* the workbook's two red fills: red and light red */
export const RED_FILLS = ['FFE06666', 'FFEA9999'];
const DRILL_ID = /^(BH|FW|FN|SH)[123]_\d+$/;

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; } else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
/* both Drive link shapes: /file/d/<id>/view and open?id=<id> */
export function driveId(link) {
  const m = /\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/.exec(String(link || ''));
  return m ? m[1] || m[2] : '';
}
/* the Drive link is the 5th column, whose header reads #REF!, so it is taken by position */
export function drillRows(csvText) {
  return parseCsv(csvText).map(r => r.map(v => v.trim())).filter(r => DRILL_ID.test(r[0] || ''))
    .map(r => ({ id: r[0], name: r[1], video: r[3], driveId: driveId(r[4]), skill: r[8] || '' }));
}

/* the files in a zip, by name */
export function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const out = {};
  for (let i = 0, p = buf.readUInt32LE(eocd + 16); i < buf.readUInt16LE(eocd + 10); i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen), start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(start, start + size);
    out[name] = method === 8 ? inflateRawSync(raw, { maxOutputLength: 64 * 1024 * 1024 }) : raw;
    p += 46 + nlen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}
const text = (files, name) => { if (!files[name]) throw new Error(`the xlsx has no ${name}`); return files[name].toString('utf8'); };
const attr = (xml, a) => (new RegExp(`\\b${a}="([^"]*)"`).exec(xml) || [])[1];

/* the IDs of the Drill Library rows with a red fill on column B, C or D */
export function redIds(xlsxBuf) {
  const files = unzip(xlsxBuf), styles = text(files, 'xl/styles.xml');
  const fills = (styles.match(/<fills[\s\S]*?<\/fills>/) || [''])[0].match(/<fill>[\s\S]*?<\/fill>|<fill\/>/g) || [];
  const fillRgb = fills.map(f => attr(f, 'rgb') || '');
  const xfFill = ((styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0].match(/<xf\b[^>]*>/g) || []).map(x => fillRgb[Number(attr(x, 'fillId') || 0)]);
  const strings = ((files['xl/sharedStrings.xml'] || '').toString('utf8').match(/<si>[\s\S]*?<\/si>/g) || [])
    .map(si => (si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''));
  const book = text(files, 'xl/workbook.xml'), rels = text(files, 'xl/_rels/workbook.xml.rels');
  const sheet = (book.match(/<sheet\b[^>]*>/g) || []).find(s => attr(s, 'name') === 'Drill Library');
  if (!sheet) throw new Error('the workbook has no Drill Library sheet');
  const rel = (rels.match(/<Relationship\b[^>]*>/g) || []).find(r => attr(r, 'Id') === attr(sheet, 'r:id'));
  if (!rel) throw new Error('the workbook does not say where its Drill Library sheet is');
  const xml = text(files, 'xl/' + attr(rel, 'Target').replace(/^\/?xl\//, ''));
  const red = new Set();
  for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) || []) {
    const cells = {};
    for (const c of row.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const v = /<v>([\s\S]*?)<\/v>/.exec(c);
      cells[attr(c, 'r').replace(/\d+$/, '')] = { rgb: xfFill[Number(attr(c, 's') || 0)], value: v ? (attr(c, 't') === 's' ? strings[Number(v[1])] : v[1]) : '' };
    }
    const id = String(cells.A ? cells.A.value : '').trim();
    if (DRILL_ID.test(id) && ['B', 'C', 'D'].some(k => cells[k] && RED_FILLS.includes(cells[k].rgb))) red.add(id);
  }
  return red;
}
