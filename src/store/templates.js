import { useCallback, useMemo } from 'react';
import { useStore } from './store';
import { allTemplates, compactTemplate, defaultTemplateId, getTemplate, isStdId } from '../lib/templates';

// Templates are stored on the company record (company.templates / company.templateDefaults),
// so they sync to the Google Sheet "Companies" tab together with the rest of the company settings.
// Google Sheets cells hold at most 50,000 characters.
export const SHEET_CELL_LIMIT = 50000;

export function useTemplates() {
  const { company, updateCompany } = useStore();
  const list = useMemo(() => allTemplates(company), [company]);

  const save = useCallback(
    (tpl) => {
      const rec = compactTemplate({ ...tpl, updatedAt: new Date().toISOString() });
      const others = (company.templates || []).filter((t) => t.id !== rec.id);
      const templates = [...others, rec];
      updateCompany(company.id, { templates });
      return { saved: rec, size: JSON.stringify(templates).length };
    },
    [company, updateCompany],
  );

  // deleting a standard template = reset it to the built-in layout
  const remove = useCallback(
    (id) => {
      const templates = (company.templates || []).filter((t) => t.id !== id);
      const defs = { ...(company.templateDefaults || {}) };
      Object.keys(defs).forEach((k) => defs[k] === id && delete defs[k]);
      updateCompany(company.id, { templates, templateDefaults: defs });
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
    remove,
    setDefault,
  };
}

// The template a transaction form uses for its screen layout
export function useFormTemplate(formType, templateId) {
  const { company } = useStore();
  return useMemo(() => getTemplate(company, templateId, formType), [company, templateId, formType]);
}

// Shrink an uploaded logo so it fits comfortably in one Google Sheet cell
export function readLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Please choose an image file (PNG or JPG).'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be opened.'));
      img.onload = () => {
        let maxW = 480;
        let maxH = 240;
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
            if (url.startsWith('data:' + type) && url.length < 40000) return resolve(url);
          }
          maxW = Math.round(maxW * 0.75);
          maxH = Math.round(maxH * 0.75);
        }
        reject(new Error('This image is too detailed. Try a smaller or simpler logo.'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
