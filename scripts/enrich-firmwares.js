// Writes data/firmwares/<id>/data.json overlays with GitHub-derived popularity
// and verification signals. This intentionally does not run during build:data:
// network-backed data should be refreshed explicitly or by a scheduled workflow.
//
// Usage:
//   npm run enrich:firmwares
//   npm run enrich:firmwares -- --dry-run
//   npm run enrich:firmwares -- --only meshcore-official,zephcore
//
// Honors GITHUB_TOKEN to raise the GitHub API rate limit.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fwBase = join(root, 'data', 'firmwares');
const today = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyArg = args.find((arg) => arg.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean)) : null;

function parseRepo(fw) {
  if (fw.changelog?.repo) return fw.changelog.repo;
  const m = /github\.com\/([^/]+\/[^/#?]+)/.exec(fw.repository ?? '');
  return m ? m[1].replace(/\.git$/, '') : null;
}

async function githubJson(path) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'meshcore-ninja',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (res.status === 404) return { ok: false, status: res.status, data: null, headers: res.headers };
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0) * 1000;
    const resetAt = Number.isFinite(reset) && reset > 0 ? new Date(reset).toISOString() : 'unknown';
    throw new Error(`GitHub API rate limit reached; set GITHUB_TOKEN or retry after ${resetAt}`);
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return { ok: true, status: res.status, data: await res.json(), headers: res.headers };
}

function countFromLinkHeader(link) {
  if (!link) return null;
  const last = link.split(',').find((part) => part.includes('rel="last"'));
  const match = /[?&]page=(\d+)/.exec(last ?? '');
  return match ? Number(match[1]) : null;
}

async function contributorCount(repo) {
  const res = await githubJson(`/repos/${repo}/contributors?anon=true&per_page=1`);
  if (!res.ok) return null;
  return countFromLinkHeader(res.headers.get('link')) ?? res.data.length;
}

async function workflowExists(repo) {
  const res = await githubJson(`/repos/${repo}/contents/.github/workflows`);
  if (!res.ok || !Array.isArray(res.data)) return false;
  return res.data.some((item) => /\.(ya?ml)$/i.test(item.name ?? ''));
}

async function releasesStats(repo) {
  const res = await githubJson(`/repos/${repo}/releases?per_page=100`);
  if (!res.ok || !Array.isArray(res.data)) {
    return { releasesAvailable: false, releaseDownloads: 0, latestReleaseDownloads: 0 };
  }

  const releases = res.data.filter((release) => !release.draft);
  const releaseDownloads = releases.reduce(
    (total, release) =>
      total + (release.assets ?? []).reduce((sum, asset) => sum + (asset.download_count ?? 0), 0),
    0
  );
  const latestReleaseDownloads = releases[0]
    ? (releases[0].assets ?? []).reduce((sum, asset) => sum + (asset.download_count ?? 0), 0)
    : 0;

  return {
    releasesAvailable: releases.length > 0,
    releaseDownloads,
    latestReleaseDownloads
  };
}

function readJson(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function enrichFirmware(id, fw) {
  const repo = parseRepo(fw);
  if (!repo) return { skipped: true, reason: 'no GitHub repository' };

  const repoRes = await githubJson(`/repos/${repo}`);
  if (!repoRes.ok) return { skipped: true, reason: `GitHub repository not found (${repo})` };

  const [contributors, ciBuilds, releaseStats] = await Promise.all([
    contributorCount(repo),
    workflowExists(repo),
    releasesStats(repo)
  ]);

  const repoData = repoRes.data;
  const popularity = {
    githubStars: repoData.stargazers_count ?? 0,
    githubForks: repoData.forks_count ?? 0,
    githubWatchers: repoData.subscribers_count ?? repoData.watchers_count ?? 0,
    githubOpenIssues: repoData.open_issues_count ?? 0,
    ...(contributors == null ? {} : { githubContributors: contributors }),
    releaseDownloads: releaseStats.releaseDownloads,
    latestReleaseDownloads: releaseStats.latestReleaseDownloads,
    lastChecked: today
  };

  const verification = {
    ...(readJson(join(fwBase, id, 'data.json')).verification ?? {}),
    sourceAvailable: true,
    releasesAvailable: releaseStats.releasesAvailable,
    ciBuilds,
    lastChecked: today
  };

  return {
    repo,
    data: {
      $comment: 'Generated by npm run enrich:firmwares. Do not edit by hand; edit firmware.yaml for authored data.',
      popularity,
      verification
    }
  };
}

let updated = 0;
let skipped = 0;
let failed = 0;

for (const d of readdirSync(fwBase, { withFileTypes: true })) {
  if (!d.isDirectory() || (only && !only.has(d.name))) continue;
  const fwPath = join(fwBase, d.name, 'firmware.yaml');
  if (!existsSync(fwPath)) continue;

  const fw = load(readFileSync(fwPath, 'utf8')) ?? {};
  const dataPath = join(fwBase, d.name, 'data.json');

  try {
    const result = await enrichFirmware(d.name, fw);
    if (result.skipped) {
      console.log(`· ${d.name}: ${result.reason}, skipping`);
      skipped += 1;
      continue;
    }
    const next = JSON.stringify(result.data, null, 2) + '\n';
    const current = existsSync(dataPath) ? readFileSync(dataPath, 'utf8') : '';
    if (next !== current) {
      if (!dryRun) writeFileSync(dataPath, next);
      console.log(`${dryRun ? 'Would update' : '✓'} ${d.name}: ${result.repo}`);
      updated += 1;
    } else {
      console.log(`· ${d.name}: already current`);
    }
  } catch (err) {
    console.error(`✗ ${d.name}: ${err.message}`);
    failed += 1;
  }
}

console.log(`\nDone — ${updated} updated, ${skipped} skipped, ${failed} failed.${dryRun ? ' Dry run only.' : ''}`);
if (failed > 0 && updated === 0) process.exit(1);
