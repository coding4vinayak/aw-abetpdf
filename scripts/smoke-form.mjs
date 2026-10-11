import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from '@cantoo/pdf-lib';

const doc = await PDFDocument.create();
const page = doc.addPage([400, 300]);
const form = doc.getForm();
const tf = form.createTextField('applicant_name'); tf.addToPage(page, { x: 20, y: 260, width: 180, height: 18 });
const ta = form.createTextField('address'); ta.enableMultiline(); ta.addToPage(page, { x: 20, y: 220, width: 180, height: 40 });
const cb = form.createCheckBox('agree_terms'); cb.addToPage(page, { x: 20, y: 180, width: 14, height: 14 });
const dd = form.createDropdown('country'); dd.setOptions(['India', 'USA', 'Germany']); dd.addToPage(page, { x: 220, y: 260, width: 120, height: 18 });
const rg = form.createRadioGroup('plan');
rg.addOptionToPage('free', page, { x: 220, y: 220, width: 12, height: 12 });
rg.addOptionToPage('premium', page, { x: 220, y: 200, width: 12, height: 12 });
const bytes = await doc.save();

const doc2 = await PDFDocument.load(bytes, { ignoreEncryption: true });
const found = doc2.getForm().getFields().map((f) => {
  if (f instanceof PDFTextField) return { name: f.getName(), kind: 'text', multiline: f.isMultiline() };
  if (f instanceof PDFCheckBox) return { name: f.getName(), kind: 'check' };
  if (f instanceof PDFRadioGroup) return { name: f.getName(), kind: 'radio', options: f.getOptions() };
  if (f instanceof PDFDropdown) return { name: f.getName(), kind: 'select', options: f.getOptions() };
  return { name: f.getName(), kind: 'other' };
});
console.log('inspect:', JSON.stringify(found));

const vals = { applicant_name: 'Vinayak', address: 'Line1 Line2', agree_terms: true, country: 'India', plan: 'premium' };
let filled = 0;
for (const f of doc2.getForm().getFields()) {
  const v = vals[f.getName()];
  if (f instanceof PDFTextField && v) { f.setText(v); filled++; }
  else if (f instanceof PDFCheckBox && v) { f.check(); filled++; }
  else if ((f instanceof PDFRadioGroup || f instanceof PDFDropdown) && v) { f.select(v); filled++; }
}
doc2.getForm().updateFieldAppearances();
doc2.getForm().flatten();
const out = await doc2.save({ useObjectStreams: true });

const doc3 = await PDFDocument.load(out);
console.log('filled:', filled, '| fields after flatten:', doc3.getForm().getFields().length, '| bytes:', out.length);
