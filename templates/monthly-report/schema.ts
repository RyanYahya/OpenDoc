export interface NarrativeItem { id: string; title: string; body: string }
export interface ReportMetric {
  id: string; label: string; value: number; target?: number; unit?: string; precision: number; note?: string;
}
export interface ReportRisk {
  id: string; title: string; level: 'low' | 'medium' | 'high'; owner: string; mitigation: string;
}
export interface ReportAction {
  id: string; title: string; owner: string; due: string; status: 'planned' | 'in-progress' | 'complete';
}
export interface MonthlyReportData {
  schemaVersion: 1;
  title: string;
  organization: string;
  preparedBy?: string;
  period: { start: string; end: string };
  issuedOn: string;
  synthetic: boolean;
  sourceNote: string;
  summary: string;
  metrics: ReportMetric[];
  highlights: NarrativeItem[];
  risks: ReportRisk[];
  actions: ReportAction[];
  notes: NarrativeItem[];
}

/** Validate the report at its data boundary, before any PDF is rendered. */
export function parseMonthlyReport(input: unknown): MonthlyReportData {
  const errors: string[] = [];
  const fail = (path: string, message: string) => { errors.push(`${path}: ${message}`); };
  const object = (value: unknown, path: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { fail(path, 'expected an object'); return {}; }
    return value as Record<string, unknown>;
  };
  const fields = (value: Record<string, unknown>, allowed: readonly string[], path: string) => {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}.${key}`, 'unknown field');
  };
  const text = (value: unknown, path: string): string => {
    if (typeof value !== 'string' || !value.trim()) { fail(path, 'expected non-empty text'); return ''; }
    return value.trim();
  };
  const optionalText = (value: unknown, path: string): string | undefined => {
    if (value === undefined || value === null || typeof value === 'string' && !value.trim()) return undefined;
    return text(value, path);
  };
  const number = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) { fail(path, 'expected a finite number'); return 0; }
    return value;
  };
  const date = (value: unknown, path: string): string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) { fail(path, 'use a real date in YYYY-MM-DD format'); return ''; }
    const [year, month, day] = value.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0)) {
      fail(path, 'use a real calendar date'); return '';
    }
    return value;
  };
  const oneOf = <T extends string>(value: unknown, choices: readonly T[], path: string): T => {
    if (typeof value !== 'string' || !choices.includes(value as T)) { fail(path, `choose ${choices.join(', ')}`); return choices[0]; }
    return value as T;
  };
  const items = <T>(value: unknown, path: string, parse: (item: Record<string, unknown>, path: string, id: string) => T): T[] => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) { fail(path, 'expected an array, or null for no entries'); return []; }
    const seen = new Set<string>();
    return value.map((entry, index) => {
      const itemPath = `${path}[${index}]`;
      const item = object(entry, itemPath);
      const id = text(item.id, `${itemPath}.id`);
      if (id && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) fail(`${itemPath}.id`, 'use a stable ID with letters, numbers, dots, hyphens, or underscores');
      if (seen.has(id)) fail(`${itemPath}.id`, `duplicate ID "${id}" in ${path}`);
      seen.add(id);
      return parse(item, itemPath, id);
    });
  };
  const narrative = (item: Record<string, unknown>, path: string, id: string): NarrativeItem => {
    fields(item, ['id', 'title', 'body'], path);
    return { id, title: text(item.title, `${path}.title`), body: text(item.body, `${path}.body`) };
  };

  const data = object(input, 'report');
  fields(data, ['schemaVersion', 'title', 'organization', 'preparedBy', 'period', 'issuedOn', 'synthetic', 'sourceNote', 'summary', 'metrics', 'highlights', 'risks', 'actions', 'notes'], 'report');
  if (data.schemaVersion !== 1) fail('report.schemaVersion', 'expected 1');
  const period = object(data.period, 'report.period');
  fields(period, ['start', 'end'], 'report.period');
  const start = date(period.start, 'report.period.start');
  const end = date(period.end, 'report.period.end');
  if (start && end && start > end) fail('report.period.end', 'must be on or after period.start');
  if (typeof data.synthetic !== 'boolean') fail('report.synthetic', 'expected true or false; explicitly identify illustrative data');

  const result: MonthlyReportData = {
    schemaVersion: 1,
    title: text(data.title, 'report.title'),
    organization: text(data.organization, 'report.organization'),
    preparedBy: optionalText(data.preparedBy, 'report.preparedBy'),
    period: { start, end },
    issuedOn: date(data.issuedOn, 'report.issuedOn'),
    synthetic: data.synthetic === true,
    sourceNote: text(data.sourceNote, 'report.sourceNote'),
    summary: text(data.summary, 'report.summary'),
    metrics: items(data.metrics, 'report.metrics', (item, path, id) => {
      fields(item, ['id', 'label', 'value', 'target', 'unit', 'precision', 'note'], path);
      const precision = item.precision === undefined || item.precision === null ? 0 : number(item.precision, `${path}.precision`);
      if (!Number.isInteger(precision) || precision < 0 || precision > 3) fail(`${path}.precision`, 'use a whole number from 0 to 3');
      return { id, label: text(item.label, `${path}.label`), value: number(item.value, `${path}.value`),
        target: item.target === undefined || item.target === null ? undefined : number(item.target, `${path}.target`),
        unit: optionalText(item.unit, `${path}.unit`), precision, note: optionalText(item.note, `${path}.note`) };
    }),
    highlights: items(data.highlights, 'report.highlights', narrative),
    risks: items(data.risks, 'report.risks', (item, path, id) => {
      fields(item, ['id', 'title', 'level', 'owner', 'mitigation'], path);
      return { id, title: text(item.title, `${path}.title`), level: oneOf(item.level, ['low', 'medium', 'high'], `${path}.level`),
        owner: text(item.owner, `${path}.owner`), mitigation: text(item.mitigation, `${path}.mitigation`) };
    }),
    actions: items(data.actions, 'report.actions', (item, path, id) => {
      fields(item, ['id', 'title', 'owner', 'due', 'status'], path);
      return { id, title: text(item.title, `${path}.title`), owner: text(item.owner, `${path}.owner`),
        due: date(item.due, `${path}.due`), status: oneOf(item.status, ['planned', 'in-progress', 'complete'], `${path}.status`) };
    }),
    notes: items(data.notes, 'report.notes', narrative),
  };
  if (errors.length) throw new Error(`Monthly report data needs attention:\n${errors.map(error => `- ${error}`).join('\n')}`);
  return result;
}
