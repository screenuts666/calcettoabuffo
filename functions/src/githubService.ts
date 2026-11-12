import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { CONFIG } from './config';

const GITHUB_API = 'https://api.github.com';

function getHeaders() {
  return {
    Authorization: `Bearer ${CONFIG.githubPat}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'CalcettoHotfixBot-CloudFunction',
  };
}

export async function cloneRepo(targetDir: string): Promise<void> {
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const cloneUrl = `https://x-access-token:${CONFIG.githubPat}@github.com/${CONFIG.githubRepo}.git`;
  console.log(`[GitHub] Clone repo ${CONFIG.githubRepo} in ${targetDir}...`);
  execSync(`git clone --depth 1 ${cloneUrl} ${targetDir}`, {
    stdio: 'pipe',
  });

  execSync('git config user.name "Calcetto Hotfix Bot"', { cwd: targetDir, stdio: 'pipe' });
  execSync('git config user.email "bot@calcettoabbuffo.app"', { cwd: targetDir, stdio: 'pipe' });
  console.log(`[GitHub] Clone completato con successo.`);
}

export function commitAndPush(targetDir: string, branchName: string, commitMsg: string): void {
  execSync(`git checkout -b ${branchName}`, { cwd: targetDir, stdio: 'pipe' });
  execSync('git add -A', { cwd: targetDir, stdio: 'pipe' });
  execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: targetDir, stdio: 'pipe' });
  const pushUrl = `https://x-access-token:${CONFIG.githubPat}@github.com/${CONFIG.githubRepo}.git`;
  execSync(`git push -u ${pushUrl} ${branchName}`, { cwd: targetDir, stdio: 'pipe' });
  console.log(`[GitHub] Branch ${branchName} pushato con successo.`);
}

export async function createPullRequest(
  branchName: string,
  title: string,
  body: string
): Promise<{ prNumber: number; prUrl: string }> {
  const url = `${GITHUB_API}/repos/${CONFIG.githubRepo}/pulls`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      title,
      body,
      head: branchName,
      base: 'main',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.warn(`[GitHub] Errore creazione PR (${res.status}): ${errorText}`);
    return { prNumber: 0, prUrl: `https://github.com/${CONFIG.githubRepo}/tree/${branchName}` };
  }

  const data = (await res.json()) as any;
  return { prNumber: data.number, prUrl: data.html_url };
}

export async function listOpenHotfixPrs(): Promise<Array<{ number: number; title: string; headRefName: string; url: string }>> {
  const url = `${GITHUB_API}/repos/${CONFIG.githubRepo}/pulls?state=open&per_page=20`;
  const res = await fetch(url, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    console.warn(`[GitHub] Errore listing PR (${res.status})`);
    return [];
  }

  const prs = (await res.json()) as any[];
  return prs
    .filter((p: any) => p.head?.ref?.startsWith('hotfix/'))
    .map((p: any) => ({
      number: p.number,
      title: p.title,
      headRefName: p.head.ref,
      url: p.html_url,
    }));
}

export async function mergeHotfixPr(prNumberOrBranch?: string): Promise<boolean> {
  const openPrs = await listOpenHotfixPrs();
  if (openPrs.length === 0) {
    throw new Error('Nessun hotfix aperto da mergiare.');
  }

  let targetPr = openPrs[0];
  if (prNumberOrBranch) {
    const found = openPrs.find(
      (p) => String(p.number) === String(prNumberOrBranch) || p.headRefName === prNumberOrBranch
    );
    if (found) targetPr = found;
  }

  const url = `${GITHUB_API}/repos/${CONFIG.githubRepo}/pulls/${targetPr.number}/merge`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({
      commit_title: `Merge hotfix #${targetPr.number}: ${targetPr.title}`,
      merge_method: 'merge',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Errore GitHub durante il merge: ${errorText}`);
  }

  // Cancella il branch remoto dopo il merge
  try {
    const deleteBranchUrl = `${GITHUB_API}/repos/${CONFIG.githubRepo}/git/refs/heads/${targetPr.headRefName}`;
    await fetch(deleteBranchUrl, { method: 'DELETE', headers: getHeaders() });
  } catch {}

  return true;
}

export async function discardHotfix(prNumberOrBranch?: string): Promise<boolean> {
  const openPrs = await listOpenHotfixPrs();
  if (openPrs.length === 0) {
    throw new Error('Nessun hotfix aperto da scartare.');
  }

  let targetPr = openPrs[0];
  if (prNumberOrBranch) {
    const found = openPrs.find(
      (p) => String(p.number) === String(prNumberOrBranch) || p.headRefName === prNumberOrBranch
    );
    if (found) targetPr = found;
  }

  // Chiudi la PR
  const url = `${GITHUB_API}/repos/${CONFIG.githubRepo}/pulls/${targetPr.number}`;
  await fetch(url, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ state: 'closed' }),
  });

  // Elimina il branch remoto
  try {
    const deleteBranchUrl = `${GITHUB_API}/repos/${CONFIG.githubRepo}/git/refs/heads/${targetPr.headRefName}`;
    await fetch(deleteBranchUrl, { method: 'DELETE', headers: getHeaders() });
  } catch {}

  return true;
}

