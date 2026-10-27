import { useCallback, useMemo } from 'react';
import { useStore } from './store';
import { stampAfter } from './companies';
import { allTemplates, compactTemplate, defaultTemplateId, getTemplate, isStdId } from '../lib/templates';

// Templates are stored on the company record (company.templates / company.templateDefaults),
// so they sync to the Google Sheet "Companies" tab together with the rest of the company settings.
// The sheet splits anything longer than a cell (50,000 characters) over extra columns (see Code.gs), so there is no hard limit,
// but every sync downloads the templates: warn when they (pictures especially) get big enough to slow it down.
export const TEMPLATE_SIZE_WARN = 400000;
export const templateSizeWarning = (size) =>
  `Your templates now use ${Math.round(size / 1000)} KB. They are sent with every Google Sheets sync, so this much makes syncing slow.\n\nDelete templates you no longer need, or remove some pictures.`;

// Saved copies are compared by their stamp when computers sync (see mergeCompanies): a save is stamped later than the
// copy it replaces, and than any "deleted" mark for it, so it wins even if this computer's clock is behind another's.
const stampFor = (company, tpl) => stampAfter(tpl.updatedAt, (company.templates || []).find((t) => t.id === tpl.id)?.updatedAt, company.templatesRemoved?.[tpl.id]);

export function useTemplates() {
  const { company, updateCompany } = useStore();
  const list = useMemo(() => allTemplates(company), [company]);

  const save = useCallback(
    (tpl) => {
      const rec = compactTemplate({ ...tpl, updatedAt: stampFor(company, tpl) });
      const others = (company.templates || []).filter((t) => t.id !== rec.id);
      const templates = [...others, rec];
      updateCompany(company.id, { templates });
      return { saved: rec, size: JSON.stringify(templates).length };
    },
    [company, updateCompany],
  );

  // save several at once (import): one company update, so none overwrites another
  const saveMany = useCallback(
    (tpls) => {
      const recs = tpls.map((tpl) => compactTemplate({ ...tpl, updatedAt: stampFor(company, tpl) }));
      const ids = new Set(recs.map((r) => r.id));
      const templates = [...(company.templates || []).filter((t) => !ids.has(t.id)), ...recs];
      updateCompany(company.id, { templates });
      return { saved: recs, size: JSON.stringify(templates).length };
    },
    [company, updateCompany],
  );

  // deleting a standard template = reset it to the built-in layout
  const remove = useCallback(
    (id) => {
      const templates = (company.templates || []).filter((t) => t.id !== id);
      const defs = { ...(company.templateDefaults || {}) };
      Object.keys(defs).forEach((k) => defs[k] === id && delete defs[k]);
      // remembered, so another computer's older copy can't bring it back (see mergeCompanies)
      const templatesRemoved = { ...(company.templatesRemoved || {}), [id]: stampFor(company, { id }) };
      updateCompany(company.id, { templates, templateDefaults: defs, templatesRemoved });
    },
    [company, updateCompany],
  );

  const setDefault = useCallback(
    (formType, id) => updateCompany(company.id, { templateDefaults: { ...(company.templateDefaults || {}), [formType]: id } }),
    [company, updateCompany],
  );

  return {
    list,
    forForm: (formType) => list.filter((t) => t.formType === formType),
    get: (id, formType) => getTemplate(company, id, formType),
    defaultId: (formType) => defaultTemplateId(company, formType),
    isCustomized: (id) => isStdId(id) && (company.templates || []).some((t) => t.id === id),
    save,
    saveMany,
    remove,
    setDefault,
  };
}

// The template a transaction form uses for its screen layout
export function useFormTemplate(formType, templateId) {
  const { company } = useStore();
  return useMemo(() => getTemplate(company, templateId, formType), [company, templateId, formType]);
}

// Shrink an uploaded logo (or other picture) so it stays small enough to travel with the company settings to the Google Sheet
export function readLogo(file, { maxW: startW = 480, maxH: startH = 240, maxChars = 40000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Please choose an image file (PNG or JPG).'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be opened.'));
      img.onload = () => {
        let maxW = startW;
        let maxH = startH;
        for (let attempt = 0; attempt < 6; attempt++) {
          const s = Math.min(1, maxW / img.width, maxH / img.height);
          const w = Math.max(1, Math.round(img.width * s));
          const h = Math.max(1, Math.round(img.height * s));
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          // JPEG has no transparency: put it on white paper first
          const flat = document.createElement('canvas');
          flat.width = w;
          flat.height = h;
          const fx = flat.getContext('2d');
          fx.fillStyle = '#fff';
          fx.fillRect(0, 0, w, h);
          fx.drawImage(c, 0, 0);
          for (const [canvas, type, q] of [
            [c, 'image/png', undefined],
            [c, 'image/webp', 0.9],
            [flat, 'image/jpeg', 0.85],
          ]) {
            const url = canvas.toDataURL(type, q);
            if (url.startsWith('data:' + type) && url.length < maxChars) return resolve(url);
          }
          maxW = Math.round(maxW * 0.75);
          maxH = Math.round(maxH * 0.75);
        }
        reject(new Error('This image is too detailed. Try a smaller or simpler picture.'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// A picture for an Image box of a template (it is saved inside the template) → { src, w, h } with the picture's size in px
export async function readBoxImage(file) {
  const src = await readLogo(file, { maxW: 500, maxH: 500, maxChars: 30000 });
  const size = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = src;
  });
  return { src, ...size };
}
