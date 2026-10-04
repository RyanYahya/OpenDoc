export type SkillSummary = { name: string; title: string; description: string };

// Skill UI metadata uses JSON-quoted YAML scalars. Keep the app index derived
// from those names and descriptions rather than maintaining another catalog.
export function skillIndex(files: Record<string, string>): SkillSummary[] {
  return Object.entries(files).map(([path, source]) => {
    const name = path.match(/\/skills\/(opendoc-[a-z0-9-]+)\/agents\/openai\.yaml$/)?.[1];
    const quoted = source.match(/^  short_description: ("(?:[^"\\]|\\.)*")\s*$/m)?.[1];
    if (!name || !quoted) throw new Error(`Invalid skill index metadata: ${path}`);
    const description: unknown = JSON.parse(quoted);
    if (typeof description !== 'string' || !description.trim()) throw new Error(`Missing skill description: ${path}`);
    // People read the display name; the exact skill name stays beside it for agents.
    const display = source.match(/^  display_name: ("(?:[^"\\]|\\.)*")\s*$/m)?.[1];
    const readable: unknown = display ? JSON.parse(display) : undefined;
    const fallback = name.replace(/^opendoc-/, '').replaceAll('-', ' ');
    const title = typeof readable === 'string' && readable.trim() ? readable.replace(/^OpenDoc:\s*/, '').trim() : fallback.charAt(0).toUpperCase() + fallback.slice(1);
    return { name, title, description };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
