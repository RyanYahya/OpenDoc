import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rmdir, unlink, link } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DOCUMENT_ID_MAX_LENGTH, TITLE_MAX_LENGTH, listStarters, type CreatedDocument, type StarterId, type StarterSummary } from '../shared/starters';
import { validId } from './render';
import { requireProject, selectedTheme, withProjects } from './projects';
import { resolveThemeAssets } from '../assets/files';
import { documentAssetAdapterSource } from '../assets/adapter';

export { listStarters } from '../shared/starters';
export type { CreateDocumentInput, CreatedDocument } from '../shared/starters';

type ErrorCode = 'INVALID_INPUT' | 'ALREADY_EXISTS' | 'UNSAFE_PATH' | 'CREATE_FAILED';
export class CreateDocumentError extends Error {
  constructor(message: string, public code: ErrorCode, public status: 400 | 409 | 500) { super(message); this.name = 'CreateDocumentError'; }
}
const invalid = (message: string) => new CreateDocumentError(message, 'INVALID_INPUT', 400);
const unsafe = () => new CreateDocumentError('The document location changed or is not a regular workspace folder. Nothing was overwritten.', 'UNSAFE_PATH', 409);
const exists = (id: string, explicitId: boolean) => new CreateDocumentError(`A folder named "${id}" already exists. Choose a different ${explicitId ? 'document ID' : 'title'}.`, 'ALREADY_EXISTS', 409);
const isCode = (error: unknown, code: string) => error instanceof Error && 'code' in error && error.code === code;

async function inputValues(root: string, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('Provide a document title and project.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['title', 'starter', 'id', 'projectId', 'theme', 'format'].includes(key))) throw invalid('Only title, starter, project, theme, format, and an optional document ID are accepted.');
  if (typeof input.projectId !== 'string' || !validId(input.projectId)) throw invalid('Choose a project before creating a document.');
  let theme: string | null;
  try { theme = await selectedTheme(root, input.theme); } catch { throw invalid('Choose an available theme.'); }
  if (typeof input.title !== 'string' || !input.title.trim()) throw invalid('Give your document a title.');
  const format = input.format ?? 'document';
  if (format !== 'document' && format !== 'presentation') throw invalid('Choose document or presentation format.');
  if (format === 'presentation' && input.starter !== undefined && input.starter !== 'blank') throw invalid('Presentations use a blank slide scaffold; document starters are not supported.');
  const title = input.title.trim();
  if (title.length > TITLE_MAX_LENGTH) throw invalid(`Keep the title to ${TITLE_MAX_LENGTH} characters or fewer.`);
  if (/[\u0000-\u001f\u007f\u2028\u2029]/u.test(title)) throw invalid('The title must fit on one line and cannot contain control characters.');
  const starter: StarterSummary | undefined = input.starter === undefined || input.starter === 'blank'
    ? { id: 'blank', name: 'Blank', description: '' }
    : listStarters().find(item => item.id === input.starter);
  if (!starter) throw invalid('Choose one of the available document starters.');
  const derived = title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, DOCUMENT_ID_MAX_LENGTH).replace(/-$/, '');
  const id = input.id === undefined ? derived || 'untitled-document' : input.id;
  if (typeof id !== 'string' || !validId(id) || id.length > DOCUMENT_ID_MAX_LENGTH) throw invalid(`Use a document ID of ${DOCUMENT_ID_MAX_LENGTH} characters or fewer, with lowercase letters, numbers, and single hyphens.`);
  return { title, id, starter, format: format as 'document' | 'presentation', projectId: input.projectId, theme, explicitId: input.id !== undefined };
}

function sourceFor(starter: StarterSummary, title: string, themeOverride: string | null, format: 'document' | 'presentation') {
  const theme = themeOverride ?? 'neutral';
  if (format === 'presentation') return `import { Presentation, Slide, Heading, type DocumentMeta } from 'opendoc';
import { theme } from './theme';

export const meta: DocumentMeta = ${JSON.stringify({ title, description: '', theme }, null, 2)};

export default function Draft() {
  return <Presentation title={meta.title} theme={theme}>
    <Slide id="opening">
      <Heading id="opening-title" level={1} style={{ fontSize: 44, lineHeight: 1.1 }}>{meta.title}</Heading>
    </Slide>
  </Presentation>;
}
`;
  const bodies: Record<StarterId, string> = {
    blank: `      <TitleBlock id="opening" title={meta.title} />`,
    article: `      <TitleBlock id="opening" eyebrow="Article · Working draft" title={meta.title} subtitle="Start with the idea you want the reader to carry away." />
      <Paragraph id="opening-paragraph">Introduce the question, observation, or experience that makes this piece worth writing. Give the reader a concrete place to begin.</Paragraph>
      <Section id="argument" title="Develop the idea" lead="Build the argument with specific examples and a clear thread between them.">
        <Paragraph id="evidence">Add the evidence or experience that supports your point. Cite factual claims and distinguish your interpretation from what a source actually establishes.</Paragraph>
      </Section>
      <Section id="ending" title="Leave something with the reader" lead="Return to the opening idea with the understanding the piece has earned." />`,
    report: `      <TitleBlock id="opening" eyebrow="Report · Working draft" title={meta.title} subtitle="A clear account of the question, the evidence, and what to do next." />
      <Section id="summary" title="Executive summary" lead="State the question this report answers and the decision it supports. Write the final summary after reviewing the evidence." />
      <Section id="findings" title="Findings" lead="Present the most relevant findings in a logical order.">
        <Paragraph id="evidence">For each finding, identify the source, date, and any limits on what it can show. Replace this guidance with verified material.</Paragraph>
      </Section>
      <Section id="recommendation" title="Recommendation" lead="Explain the recommended action, who would own it, and what would count as progress.">
        <Callout id="limitations" title="Before sharing">Make assumptions and unresolved questions explicit. This starter contains guidance only; it does not contain findings or verified claims.</Callout>
      </Section>`,
    proposal: `      <TitleBlock id="opening" eyebrow="Proposal · Working draft" title={meta.title} subtitle="A focused plan for a clearly defined need." />
      <Section id="need" title="The need" lead="Describe the client's situation, the problem to solve, and the outcome that would make the work worthwhile." />
      <Section id="approach" title="Proposed approach" lead="Explain how the work would proceed and why the approach fits this need.">
        <List id="scope" items={[
          { id: 'deliverables', children: 'Deliverables — define the concrete outputs and how they will be accepted.' },
          { id: 'timing', children: 'Timing — name the phases, dependencies, and review points.' },
          { id: 'responsibilities', children: 'Responsibilities — explain what each party needs to provide.' },
        ]} />
      </Section>
      <Section id="commercials" title="Scope and next steps" lead="Specify the pricing basis, assumptions, exclusions, and the decision needed to proceed.">
        <Paragraph id="terms-note">No prices, dates, commitments, or client facts have been supplied. Confirm them before presenting this as a proposal.</Paragraph>
      </Section>`,
    research: `      <TitleBlock id="opening" eyebrow="Research paper · Working draft" title={meta.title} subtitle="A question that can be examined, a method that can be understood." />
      <Section id="abstract" title="Abstract" lead="Summarize the question, method, principal result, and limits only after the study is described. No results have been supplied in this starter." />
      <Section id="introduction" title="Introduction" lead="Define the research question and explain its importance using traceable sources." />
      <Section id="methods" title="Methods" lead="Describe the materials or data, selection criteria, procedure, and analysis in enough detail for another reader to evaluate the work." />
      <Section id="results" title="Results" lead="Report the observations with units and uncertainty where appropriate. Separate measured results from interpretation." />
      <Section id="discussion" title="Discussion and limitations" lead="Explain what the results support, what they do not support, and which limitations affect the conclusion.">
        <Paragraph id="sources-note">Add verified reference records and cite them where they support the text. Do not use illustrative values as study results.</Paragraph>
      </Section>`,
    technical: `      <TitleBlock id="opening" eyebrow="Technical brief · Working draft" title={meta.title} subtitle="A decision that can be understood, implemented, and checked." />
      <Section id="context" title="Context and requirements" lead="Explain the system or problem, the intended reader, and the constraints that shape the solution." />
      <Section id="design" title="Design and decisions" lead="Describe the proposed design and the reasons for the main choices.">
        <List id="decision-checks" items={[
          { id: 'interfaces', children: 'Interfaces — define inputs, outputs, and failure behavior.' },
          { id: 'tradeoffs', children: 'Tradeoffs — record the alternatives and why a choice was made.' },
          { id: 'constraints', children: 'Constraints — state performance, security, and compatibility requirements that actually apply.' },
        ]} />
      </Section>
      <Section id="verification" title="Verification" lead="Define the checks or measurements that will demonstrate the design works.">
        <Paragraph id="verification-note">Record observed results separately from targets. Include relevant edge cases and unresolved risks; this starter makes no performance or reliability claims.</Paragraph>
      </Section>`,
  };
  const body = bodies[starter.id];
  const imports = ['Document', 'Pages', 'TitleBlock', ...(starter.id === 'blank' ? [] : ['Paragraph', 'Section']), ...(body.includes('<List') ? ['List'] : []), ...(body.includes('<Callout') ? ['Callout'] : [])];
  return `import { ${imports.join(', ')}, type DocumentMeta } from 'opendoc';
import { theme } from './theme';

export const meta: DocumentMeta = ${JSON.stringify({ title, description: starter.description, ...(starter.id === 'blank' ? {} : { kind: starter.kind }), theme }, null, 2)};

// Ask Codex to develop this draft using your brief and sources. Keep block IDs stable as it grows.
export default function Draft() {
  return <Document title={meta.title} theme={theme}>
    <Pages title={meta.title}>
${body}
    </Pages>
  </Document>;
}
`;
}

/** Reserve the folder exclusively, then expose index.tsx only after every companion file is complete. */
export async function createDocument(root: string, input: unknown): Promise<CreatedDocument> {
  const values = await inputValues(root, input);
  const workspace = await realpath(root);
  return createInProject(workspace, values, async theme => ({ 'index.tsx': sourceFor(values.starter, values.title, theme, values.format) }));
}

export async function createDocumentFromFiles(root: string, input: { title: string; id?: string; projectId: string; theme?: string | null; format?: 'document' | 'presentation' }, files: Record<string, string> | ((id: string, theme: string | null) => Record<string, string> | Promise<Record<string, string>>)) {
  const values = await inputValues(root, input);
  return createInProject(root, values, async theme => typeof files === 'function' ? files(values.id, theme) : files);
}

async function createInProject(root: string, values: Awaited<ReturnType<typeof inputValues>>, files: (theme: string | null) => Promise<Record<string, string>>) {
  return withProjects(root, async (manifest, save) => {
    const project = requireProject(manifest, values.projectId);
    let theme: string | null;
    try { theme = values.theme ?? await selectedTheme(root, project.defaultTheme ?? 'neutral'); }
    catch { throw invalid('Choose an available theme.'); }
    const contents = await files(theme);
    if (Object.hasOwn(contents, 'assets.json') || Object.hasOwn(contents, 'theme.tsx')) throw invalid('assets.json and theme.tsx are created from the chosen theme. Bind different assets after creation.');
    // Publish the immutable choices and adapter before the entry. Template factories
    // import this adapter, so their captured theme receives the saved font choices.
    const selections = resolveThemeAssets(root, theme ?? 'neutral');
    contents['assets.json'] = `${JSON.stringify(selections, null, 2)}\n`;
    contents['theme.tsx'] = documentAssetAdapterSource(theme ?? 'neutral');
    const previous = Object.hasOwn(manifest.assignments, values.id) ? manifest.assignments[values.id] : undefined;
    const previousFormat = manifest.formats && Object.hasOwn(manifest.formats, values.id) ? manifest.formats[values.id] : undefined;
    let assigned = false;
    return reserveDocument(root, values, contents, async () => {
      manifest.assignments[values.id] = project.id;
      if (values.format === 'presentation' || previousFormat !== undefined) (manifest.formats ??= {})[values.id] = values.format;
      await save(); assigned = true;
    }, async () => {
      if (!assigned) return;
      if (previous === undefined) delete manifest.assignments[values.id]; else manifest.assignments[values.id] = previous;
      if (previousFormat === undefined) { if (manifest.formats) delete manifest.formats[values.id]; } else (manifest.formats ??= {})[values.id] = previousFormat;
      await save();
    });
  });
}

async function reserveDocument(root: string, { title, id, starter, projectId, explicitId }: Awaited<ReturnType<typeof inputValues>>, files: Record<string, string>, beforePublish: () => Promise<void>, rollback: () => Promise<void>): Promise<CreatedDocument> {
  if (!files['index.tsx'] || Object.keys(files).some(name => !/^[a-zA-Z0-9_-]+\.(tsx|json)$/.test(name))) throw invalid('Document files need a TSX entry and simple local filenames.');
  const workspace = await realpath(resolve(root));
  const documents = resolve(workspace, 'documents');
  try { await mkdir(documents); } catch (error) { if (!isCode(error, 'EEXIST')) throw error; }
  const docsInfo = await lstat(documents);
  if (!docsInfo.isDirectory() || docsInfo.isSymbolicLink() || await realpath(documents) !== documents) throw unsafe();
  const destination = resolve(documents, id);
  try { await mkdir(destination); } catch (error) { if (isCode(error, 'EEXIST')) throw exists(id, explicitId); throw error; }
  const folderInfo = await lstat(destination);
  const createdFolders: string[] = [];
  const created = new Map<string, { dev: number; ino: number }>();
  async function assertFolder() {
    const [folder, parent] = await Promise.all([lstat(destination), lstat(documents)]);
    if (!folder.isDirectory() || folder.isSymbolicLink() || folder.dev !== folderInfo.dev || folder.ino !== folderInfo.ino || parent.dev !== docsInfo.dev || parent.ino !== docsInfo.ino || await realpath(destination) !== destination) throw unsafe();
  }
  async function writeNew(name: string, content: string) {
    await assertFolder();
    const handle = await open(resolve(destination, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
    try {
      const info = await handle.stat(); created.set(name, { dev: info.dev, ino: info.ino });
      await handle.writeFile(content, 'utf8');
    } finally { await handle.close(); }
  }
  async function removeOwn(name: string) {
    const identity = created.get(name);
    if (!identity) return;
    await assertFolder();
    const current = await lstat(resolve(destination, name)).catch(error => { if (isCode(error, 'ENOENT')) return null; throw error; });
    if (current?.dev === identity.dev && current.ino === identity.ino) await unlink(resolve(destination, name));
  }
  const pending = `.index-${randomUUID()}.tmp`;
  try {
    for (const folder of ['media']) {
      await assertFolder();
      await mkdir(resolve(destination, folder)); createdFolders.push(folder);
      await writeNew(`${folder}/.gitkeep`, '');
    }
    for (const [name, content] of Object.entries(files)) if (name !== 'index.tsx') await writeNew(name, content);
    await writeNew(pending, files['index.tsx']);
    await assertFolder();
    await beforePublish();
    await assertFolder();
    // link is exclusive: even an unexpected index added during creation is never replaced.
    await link(resolve(destination, pending), resolve(destination, 'index.tsx'));
    // Publication succeeded. A cleanup problem must not remove the completed document's data.
    await removeOwn(pending).catch(() => {});
    return { id, title, starter: starter.id, projectId, entry: `documents/${id}/index.tsx` };
  } catch (error) {
    const rollbackError = await rollback().then(() => null, error => error);
    // A user may have added files while creation was in progress. Remove only our own writes.
    for (const name of created.keys()) await removeOwn(name).catch(() => {});
    for (const folder of createdFolders.reverse()) await rmdir(resolve(destination, folder)).catch(() => {});
    await assertFolder().then(() => rmdir(destination)).catch(() => {});
    if (rollbackError) throw new CreateDocumentError(`Document creation failed and its project assignment could not be restored. Check projects.json before retrying. ${rollbackError instanceof Error ? rollbackError.message : ''}`, 'CREATE_FAILED', 500);
    if (error instanceof CreateDocumentError) throw error;
    throw new CreateDocumentError(`Could not create "${id}". No existing document was overwritten. ${error instanceof Error ? error.message : ''}`, 'CREATE_FAILED', 500);
  }
}
