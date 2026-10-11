import { buildDocxBlob, documentXml } from '../lib/docx.mjs';
import { writeFileSync } from 'fs';

const pages = [
  ['Invoice #2024-001', 'Billed to: Acme & Co <test>'],
  ['Total due: $500', 'Thank you!'],
  [],
];
const xml = documentXml(pages);
if (!xml.includes('Acme &amp; Co &lt;test&gt;')) throw new Error('escaping broken');
if ((xml.match(/w:br w:type="page"/g) || []).length !== 2) throw new Error('page break count wrong: ' + (xml.match(/w:br/g) || []).length);

const blob = await buildDocxBlob(pages);
writeFileSync('/tmp/smoke.docx', new Uint8Array(await blob.arrayBuffer()));
console.log('docx bytes:', blob.size, '| mime ok:', blob.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
