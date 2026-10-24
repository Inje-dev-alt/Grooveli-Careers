/**
 * Raising a notice.
 *
 * One writer, called from wherever something happens that a person is waiting
 * on. Kept out of the route modules because the pipeline has three entrances —
 * an employer moving a stage, a candidate answering an offer, and later the
 * scheduler — and all three owe the same person the same kind of message.
 *
 * **A failed notice never fails the thing it was about.** Every call here is
 * logged and swallowed. The stage change is already durable in `applications`
 * and `application_events` by the time this runs; answering the employer with
 * a 500 because the bell did not ring would turn a cosmetic failure into a
 * move they would try again.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type NotificationType =
  | 'match'
  | 'application'
  | 'interview'
  | 'mission'
  | 'mission-reminder'
  | 'system';

export type Notice = {
  type: NotificationType;
  title: string;
  body?: string;
  route?: string | null;
};

/** Row to the §5 Notification JSON. */
export function toNotification(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body ?? '',
    route: row.route ?? undefined,
    read: row.read ?? false,
    createdAt: row.created_at,
  };
}

/** Write one notice. Returns false if it could not be written. */
export async function notify(
  admin: SupabaseClient,
  userId: string,
  notice: Notice,
): Promise<boolean> {
  const { error } = await admin.from('notifications').insert({
    user_id: userId,
    type: notice.type,
    title: notice.title,
    body: notice.body ?? '',
    route: notice.route ?? null,
  });
  if (error) {
    console.error('[notify] could not raise notice:', error.message);
    return false;
  }
  return true;
}

/**
 * What the candidate is told when their application reaches a stage.
 *
 * The wording is the prototype's, which had two sets for the same transitions:
 * `simulateStep` wrote a specific line per stage, and `setApplicationStatus`
 * wrote a generic "moved to shortlisted" for the same move made by a real
 * employer. The specific one is kept — a candidate should not get a flatter
 * message because a person rather than the simulation moved them — and the
 * generic one is gone.
 *
 * `null` means no notice for that stage. `applied` is the candidate's own
 * action, and `withdrawn`, `declined` and `hired` are decisions they just made
 * themselves; telling someone what they have this second done is noise.
 */
export function stageNotice(
  status: string,
  jobTitle: string,
  companyName: string,
): Notice | null {
  switch (status) {
    case 'under-review':
      return {
        type: 'application',
        title: `${companyName} is reviewing`,
        body: `${jobTitle} - your application moved from submitted to in review.`,
        route: '/profile',
      };
    case 'shortlisted':
      return {
        type: 'application',
        title: `Shortlisted - ${jobTitle}`,
        body: `${companyName} shortlisted you. The next stage is an interview.`,
        route: '/profile',
      };
    case 'interview':
      return {
        type: 'interview',
        title: `Interview stage - ${jobTitle}`,
        body: `${companyName} wants to interview you. Practise in the AI Career Center.`,
        route: '/ai',
      };
    case 'assessment':
      return {
        type: 'application',
        title: `Assessment stage - ${jobTitle}`,
        body: `${companyName} has sent you an assessment. Open your applications to start it.`,
        route: '/profile',
      };
    case 'offer':
      return {
        type: 'application',
        title: `Offer received - ${jobTitle}`,
        body: `${companyName} made you an offer. Open your applications to accept or decline.`,
        route: '/profile',
      };
    case 'rejected':
      return {
        type: 'application',
        title: `${companyName} decided not to progress`,
        body: `${jobTitle} - feedback is on your application. Rejections are data, not a verdict.`,
        route: '/profile',
      };
    default:
      return null;
  }
}
