import * as fs from 'fs';
import * as path from 'path';

export function getCurrentPlanPath(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), '.0-1-cli', 'plans', 'current.md');
}

export function writeCurrentPlanFile(workspaceRoot: string, content: string): string {
  const planPath = getCurrentPlanPath(workspaceRoot);
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, content.trim() + '\n', 'utf8');
  return planPath;
}

export function readCurrentPlanFile(workspaceRoot: string): string | null {
  const planPath = getCurrentPlanPath(workspaceRoot);
  if (!fs.existsSync(planPath)) return null;
  const content = fs.readFileSync(planPath, 'utf8').trim();
  return content || null;
}

export function ensurePlanDraftPath(workspaceRoot: string): string {
  const planPath = getCurrentPlanPath(workspaceRoot);
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  if (!fs.existsSync(planPath)) {
    fs.writeFileSync(planPath, '', 'utf8');
  }
  return planPath;
}

export function resolvePlanForApproval(workspaceRoot: string, toolPlan?: string): string {
  const filePlan = readCurrentPlanFile(workspaceRoot);
  const inlinePlan = toolPlan?.trim();
  return filePlan || inlinePlan || '';
}
