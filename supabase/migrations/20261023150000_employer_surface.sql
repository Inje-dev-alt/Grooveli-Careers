-- Batch 3.4 — what the employer side needs that the schema did not have.
--
-- The employer tables already exist: `organizations`,
-- `organization_memberships`, `jobs`, `applications` and `application_events`
-- have been there since 20261018. The pipeline an employer moves is the same
-- `applications` table the candidate reads, which is the point of the
-- marketplace and the reason this batch adds almost nothing to the model.
--
-- Two columns and three indexes, each for a named query.
--
-- Reversal:
--   drop index if exists organization_memberships_user_idx;
--   drop index if exists applications_status_idx;
--   drop index if exists organizations_district_idx;
--   alter table public.organizations drop column if exists logo_url;

-- `POST /organizations/:id/logo` had nowhere to write. `logo_color` is what
-- every screen actually renders today (`CompanyMark`), and stays the fallback;
-- this is the uploaded mark for when there is one.
--
-- Nothing is uploaded yet. Like the CV in §4.1 this records a file name only,
-- and real storage is the same open decision -- see the handoff. The column
-- exists so the endpoint is not lying about having stored something.
alter table public.organizations
  add column if not exists logo_url text;

-- `GET /organizations/active` resolves the signed-in employer's membership on
-- every employer page load, and the pipeline checks membership before every
-- write. Both look up by user, and the only index on this table was the
-- `unique (organization_id, user_id)` constraint, whose leading column is the
-- organization -- no help for a lookup that knows the user.
create index if not exists organization_memberships_user_idx
  on public.organization_memberships (user_id);

-- `/organizations/:id/overview` and `/analytics` count applications per stage.
create index if not exists applications_status_idx
  on public.applications (status);

-- `GET /organizations?districtId=` is how the city's company lists are built:
-- walking into a district asks for the organizations in it.
create index if not exists organizations_district_idx
  on public.organizations (district_id);
