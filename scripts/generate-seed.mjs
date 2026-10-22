/**
 * Generates the marketplace seed migration from the repo's own fixtures.
 *
 * The mock layer and the seeded database must serve identical demo data, so
 * the SQL is derived from src/mock/*.js rather than retyped - re-run this
 * script whenever the fixtures change:
 *
 *   node scripts/generate-seed.mjs
 *
 * Output: supabase/migrations/<timestamp>_seed_marketplace.sql (idempotent
 * `on conflict do nothing`, safe to re-apply).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { organizations } from '../src/mock/organizations.js';
import { jobs } from '../src/mock/jobs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** SQL string literal ('' doubles quotes; the content is always UTF-8 text). */
function str(value) {
  if (value === undefined || value === null) return 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Postgres array literal from a JS string array, with element escaping. */
function arr(values) {
  if (!values?.length) return `'{}'`;
  const body = values
    .map((v) => String(v).replaceAll('\\', '\\\\').replaceAll(',', '\\,').replaceAll('}', '\\}'))
    .join(',');
  return `'{${body}}'`;
}

const ORG_COLUMNS = {
  id: (o) => str(o.id),
  name: (o) => str(o.name),
  tagline: (o) => str(o.tagline),
  description: (o) => str(o.description),
  industry: (o) => str(o.industry),
  size_band: (o) => str(o.size),
  location: (o) => str(o.location),
  website: (o) => str(o.website),
  district_id: (o) => str(o.districtId),
  logo_color: (o) => str(o.logoColor),
  follower_count: (o) => String(o.followerCount ?? 0),
  verified: (o) => (o.verified ? 'true' : 'false'),
  created_at: (o) => str(o.createdAt),
};

const JOB_COLUMNS = {
  id: (j) => str(j.id),
  organization_id: (j) => str(j.organizationId),
  company_name: (j) => str(j.companyName),
  title: (j) => str(j.title),
  description: (j) => str(j.description),
  salary_min: (j) => String(j.salaryMin ?? 0),
  salary_max: (j) => String(j.salaryMax ?? 0),
  currency: (j) => str(j.currency),
  salary_period: (j) => str(j.salaryPeriod),
  location: (j) => str(j.location),
  work_type: (j) => str(j.workType),
  employment_type: (j) => str(j.employmentType),
  experience_level: (j) => str(j.experienceLevel),
  required_skills: (j) => arr(j.requiredSkills),
  preferred_skills: (j) => arr(j.preferredSkills),
  industry: (j) => str(j.industry),
  district_id: (j) => str(j.districtId),
  deadline: (j) => str(j.deadline),
  status: (j) => str(j.status),
  source: (j) => str(j.source),
  responsibilities: (j) => arr(j.responsibilities),
  requirements: (j) => arr(j.requirements),
  featured: (j) => (j.featured ? 'true' : 'false'),
  created_at: (j) => str(j.createdAt),
};

function insertStatement(table, columns, rows) {
  const names = Object.keys(columns);
  const tuples = rows
    .map((row) => `  (${names.map((c) => columns[c](row)).join(', ')})`)
    .join(',\n');
  return [
    `insert into public.${table} (${names.join(', ')}) values`,
    tuples,
    'on conflict (id) do nothing;',
  ].join('\n');
}

const header = [
  '-- Marketplace demo data, generated from src/mock fixtures.',
  '--',
  '-- Regenerate with: node scripts/generate-seed.mjs',
  '-- Idempotent: on conflict (id) do nothing, safe to re-apply.',
  '-- Accounts are NOT seeded - auth users are created through /auth/register.',
  '',
].join('\n');

const sql = [
  header,
  insertStatement('organizations', ORG_COLUMNS, organizations),
  '',
  insertStatement('jobs', JOB_COLUMNS, jobs),
  '',
].join('\n');

const out = join(root, 'supabase', 'migrations', '20261018160200_seed_marketplace.sql');
writeFileSync(out, sql, 'utf8');
console.log(`wrote ${out}: ${organizations.length} organizations, ${jobs.length} jobs`);
