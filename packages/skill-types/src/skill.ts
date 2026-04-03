// Types for SKILL.md structure

export interface SkillFrontmatter {
  name: string;
  description: string;
  version: string;
  author?: string;
  tools?: string[];
  permissions?: ('read_files' | 'write_files' | 'network' | 'shell' | 'mcp')[];
  triggers?: string[];
}

export interface ParsedSkill {
  hash: string;             // SHA-256 hex of raw content
  frontmatter: SkillFrontmatter;
  body: string;             // markdown body (after frontmatter)
  rawContent: string;
  sizeBytes: number;
}
