// A minimal .xlsx writer (one sheet, text and numbers), enough for A1 FreshPay's article import.
// An .xlsx is a zip of a few XML files; entries are stored uncompressed, which every reader accepts.
import { crc32 } from './qr.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };

function sheetXml(rows) {
  const body = rows.map((row, r) => `<row r="${r + 1}">` + row.map((v, c) => {
    if (v === null || v === undefined || v === '') return '';
    const ref = `${colName(c)}${r + 1}`;
    return typeof v === 'number'
      ? `<c r="${ref}"><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('') + '</row>').join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export async function xlsx(sheetName, rows) {
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': sheetXml(rows),
  };
  return zip(Object.entries(files).map(([name, text]) => [new TextEncoder().encode(name), new TextEncoder().encode(text)]));
}

// zip with stored (uncompressed) entries; the 0x0800 flag marks UTF-8 names
function zip(entries) {
  const parts = [], central = [];
  let offset = 0;
  const le = (n, bytes) => { const b = new Uint8Array(bytes); for (let i = 0; i < bytes; i++) b[i] = (n >>> (8 * i)) & 255; return b; };
  const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 12 << 5 | 1;
  for (const [name, data] of entries) {
    const crc = crc32(data);
    const head = [le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(0, 2), le(DOS_TIME, 2), le(DOS_DATE, 2),
      le(crc, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), name];
    const local = concat(head);
    parts.push(local, data);
    central.push(concat([le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), le(DOS_TIME, 2), le(DOS_DATE, 2),
      le(crc, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4),
      le(offset, 4), name]));
    offset += local.length + data.length;
  }
  const cd = concat(central);
  const end = concat([le(0x06054b50, 4), le(0, 2), le(0, 2), le(entries.length, 2), le(entries.length, 2), le(cd.length, 4), le(offset, 4), le(0, 2)]);
  return concat([...parts, cd, end]);
}
function concat(list) {
  const out = new Uint8Array(list.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of list) { out.set(p, o); o += p.length; }
  return out;
}
