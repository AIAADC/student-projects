import { RuntimeSkill } from './runtime';

export interface RuntimeSkillSearchResult {
  skill: RuntimeSkill;
  score: number;
}

export type SkillSelection =
  | { kind: 'clear' }
  | { kind: 'missing'; query: string }
  | { kind: 'select'; skill: RuntimeSkill };

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function scoreRuntimeSkill(skill: RuntimeSkill, query: string): number {
  const normalized = normalizeQuery(query);
  if (!normalized) return 0;

  const id = skill.id.toLowerCase();
  const name = skill.name.toLowerCase();
  const description = skill.description.toLowerCase();
  const trigger = (skill.whenToUse || '').toLowerCase();

  if (id === normalized) return 1000;
  if (id.startsWith(normalized)) return 900;
  if (name === normalized) return 850;
  if (name.startsWith(normalized)) return 800;
  if (id.includes(normalized)) return 750;
  if (name.includes(normalized)) return 700;
  if (trigger.includes(normalized)) return 650;
  if (description.includes(normalized)) return 600;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const tokenScore = tokens.reduce((score, token) => {
      if (id.includes(token)) return score + 120;
      if (name.includes(token)) return score + 100;
      if (trigger.includes(token)) return score + 80;
      if (description.includes(token)) return score + 60;
      return score;
    }, 0);
    if (tokenScore >= tokens.length * 60) {
      return 500 + tokenScore;
    }
  }

  return 0;
}

export function searchRuntimeSkills(query: string, skills: RuntimeSkill[]): RuntimeSkillSearchResult[] {
  return skills
    .map((skill) => ({ skill, score: scoreRuntimeSkill(skill, query) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.skill.id.localeCompare(right.skill.id);
    });
}

export function resolveSkillSelection(query: string, skills: RuntimeSkill[]): SkillSelection {
  const normalized = query.trim().toLowerCase();
  if (normalized === 'clear' || normalized === 'off' || normalized === 'none') return { kind: 'clear' };

  const [best] = searchRuntimeSkills(query, skills);
  if (!best) return { kind: 'missing', query };
  return { kind: 'select', skill: best.skill };
}
