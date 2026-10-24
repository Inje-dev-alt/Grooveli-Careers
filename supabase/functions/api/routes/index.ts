/**
 * Route registry. Every route module imports `route` and registers itself;
 * this file imports them for their side effects so index.ts stays a list.
 *
 * Batches add one line each: auth (§11.1), jobs (§11.2), candidates (§11.3),
 * applications (§11.4), career (§11.5), missions (§11.6), organizations
 * (§11.8), then social, learning, interviews and ai later.
 */
import './health.ts';
import './auth.ts';
import './users.ts';
import './onboarding.ts';
import './jobs.ts';
import './candidates.ts';
import './applications.ts';
import './career.ts';
import './missions.ts';
import './organizations.ts';
import './notifications.ts';
import './social.ts';
