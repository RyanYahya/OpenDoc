export type SkillSummary = { name: string; description: string };

// Skill UI metadata uses JSON-quoted YAML scalars. Keep the app index derived
// from those descriptions rather than maintaining another catalog.
export function skillIndex(files: Record<string, string>): SkillSummary[] {
  return Object.entries(files).map(([path, source]) => {
    const name = path.match(/\/skills\/(opendoc-[a-z0-9-]+)\/agents\/openai\.yaml$/)?.[1];
    const quoted = source.match(/^  short_description: ("(?:[^"\\]|\\.)*")\s*$/m)?.[1];
    if (!name || !quoted) throw new Error(`Invalid skill index metadata: ${path}`);
    const description: unknown = JSON.parse(quoted);
    if (typeof description !== 'string' || !description.trim()) throw new Error(`Missing skill description: ${path}`);
    return { name, description };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
