// Customized Templates: export and import of everything the user has customized, in one file (.aycustom.json):
//  - formTemplates: invoice / bill / receipt… designs (Lists › Templates)
//  - reportSettings / memorizedReports: Customize Report settings (columns, added fields, header, footer, number style)
//  - importTemplates: Excel import templates with own columns and headings
// A section may be missing. Older .aytemplate.json files (form templates only) are still read.
// A file is never trusted: every part is checked and cleaned before it is used.

import { TEMPLATE_FILE_APP, parseTemplateFile, templateExportPayload } from './templates';
import { REPORT_NAMES } from './commands';
import { SESSION_ONLY_REPORTS, isDefaultOptions, normalizeOptions } from './reportOptions';
import { cleanImportCustom } from './importTemplates';

export const CUSTOM_APP = 'AY Toys Customizations';
export const CUSTOM_EXT = '.aycustom.json';

export function customPayload({ templates = [], reports = [], memorized = [], importTemplates = null } = {}) {
  const out = { app: CUSTOM_APP, version: 1, exportedAt: new Date().toISOString() };
  if (templates.length) out.formTemplates = templateExportPayload(templates).templates;
  if (reports.length) out.reportSettings = reports.map((r) => ({ reportId: r.reportId, options: normalizeOptions(r.options) }));
  if (memorized.length) out.memorizedReports = memorized;
  if (importTemplates && Object.keys(importTemplates).length) out.importTemplates = importTemplates;
  return out;
}

const text = (v, max = 200) => String(v ?? '').slice(0, max);
const knownReport = (id) => typeof id === 'string' && !!REPORT_NAMES[id];

// -> { templates, reports: [{ reportId, options }], memorized: [...], importTemplates, skipped }  or throws a readable Error
export function parseCustomFile(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('This is not a customization file (it could not be read).');
  }
  if (data && data.app === TEMPLATE_FILE_APP) {
    const { templates, skipped } = parseTemplateFile(raw);
    return { templates, reports: [], memorized: [], importTemplates: {}, skipped };
  }
  if (!data || data.app !== CUSTOM_APP) throw new Error('This is not an AY Toys customization file. Use a file made with "Export" on the Customized Templates screen.');

  let skipped = 0;
  let templates = [];
  if (Array.isArray(data.formTemplates) && data.formTemplates.length) {
    const r = parseTemplateFile(JSON.stringify({ app: TEMPLATE_FILE_APP, version: 1, templates: data.formTemplates }));
    templates = r.templates;
    skipped += r.skipped;
  }

  const reports = [];
  const seen = new Set();
  (Array.isArray(data.reportSettings) ? data.reportSettings : []).forEach((r) => {
    if (!r || !knownReport(r.reportId) || SESSION_ONLY_REPORTS.has(r.reportId) || seen.has(r.reportId)) {
      skipped++;
      return;
    }
    const options = normalizeOptions(r.options);
    if (isDefaultOptions(options)) return;
    seen.add(r.reportId);
    reports.push({ reportId: r.reportId, options });
  });

  const memorized = [];
  (Array.isArray(data.memorizedReports) ? data.memorizedReports : []).forEach((m) => {
    if (!m || !knownReport(m.reportId) || !text(m.name).trim()) {
      skipped++;
      return;
    }
    const entry = {
      name: text(m.name, 120).trim(),
      reportId: m.reportId,
      filter: m.filter && typeof m.filter === 'object' && !Array.isArray(m.filter) ? m.filter : {},
      range: text(m.range, 60),
      from: text(m.from, 10),
      to: text(m.to, 10),
    };
    if (m.options) {
      const options = normalizeOptions(m.options);
      if (!isDefaultOptions(options)) entry.options = options;
    }
    memorized.push(entry);
  });

  return { templates, reports, memorized, importTemplates: cleanImportCustom(data.importTemplates), skipped };
}

export const customCounts = (r) => ({
  templates: r.templates.length,
  reports: r.reports.length + r.memorized.length,
  excel: Object.keys(r.importTemplates).length,
});
