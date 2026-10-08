import { useState } from 'react';
import './social.css';
import { Panel, Button, TextArea, Chip, Select, IconClose } from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useAuthStore } from '../../stores/authStore.js';
import { useSocialStore } from '../../stores/socialStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import { POST_TYPES } from '../../services/socialService.js';
import * as careerService from '../../services/careerService.js';
import { recordCareerEvent } from '../../stores/progression.js';
import { CAREER_EVENTS } from '../../utils/careerEvents.js';
import { initials } from '../../utils/format.js';

/**
 * Write a post.
 *
 * Achievements can be attached, which is the point of the whole network: the
 * thing worth sharing is evidence of career work, and attaching it turns a
 * claim into something a reader can check.
 */
export function PostComposer() {
  const user = useAuthStore((s) => s.user);
  const publish = useSocialStore((s) => s.publish);
  const posting = useSocialStore((s) => s.posting);
  const pushToast = useUiStore((s) => s.pushToast);

  const [body, setBody] = useState('');
  const [type, setType] = useState('insight');
  const [attachmentId, setAttachmentId] = useState('');
  const [error, setError] = useState(null);

  // Only achievements you have actually earned can be attached.
  const achievementsQuery = useAsync(() => careerService.listAchievements(), []);
  const earned = (achievementsQuery.data ?? []).filter((a) => a.earned);
  const attachment = earned.find((a) => a.id === attachmentId);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!body.trim()) return;

    try {
      await publish({
        body,
        type,
        attachment: attachment
          ? {
              kind: 'achievement',
              refId: attachment.id,
              label: attachment.name,
              detail: attachment.description,
              verified: true,
            }
          : undefined,
      });
      setBody('');
      setAttachmentId('');
      recordCareerEvent(CAREER_EVENTS.POST_PUBLISHED, { label: 'Shared a career post', shareable: true });
      pushToast({ title: 'Posted to your network', tone: 'success' });
    } catch (caught) {
      setError(caught.message || 'Could not publish that post.');
    }
  };

  return (
    <Panel pad="sm">
      <form className="composer" onSubmit={submit}>
        <div className="composer__head">
          <span className="composer__avatar">{initials(user?.displayName ?? 'You')}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--g-font-display)', fontWeight: 600, fontSize: 'var(--g-text-sm)' }}>
              Share something from your career
            </p>
            <p className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>
              A finished course, a verified skill, something you learned the hard way.
            </p>
          </div>
        </div>

        <TextArea
          value={body}
          placeholder="Just completed my Excel Foundations challenge on Grooveli…"
          aria-label="Post body"
          onChange={(e) => setBody(e.target.value)}
        />

        <div className="composer__types">
          {POST_TYPES.map((option) => (
            <Chip key={option.id} active={type === option.id} onClick={() => setType(option.id)}>
              {option.label}
            </Chip>
          ))}
        </div>

        {earned.length > 0 ? (
          <Select
            value={attachmentId}
            aria-label="Attach an achievement"
            onChange={(e) => setAttachmentId(e.target.value)}
          >
            <option value="">Attach an achievement (optional)</option>
            {earned.map((achievement) => (
              <option key={achievement.id} value={achievement.id}>
                {achievement.name}
              </option>
            ))}
          </Select>
        ) : null}

        {attachment ? (
          <div className="composer__attach">
            <span className="composer__attach-label">
              {attachment.name}
              <button
                type="button"
                className="post__action"
                onClick={() => setAttachmentId('')}
                aria-label="Remove attachment"
                style={{ padding: 4 }}
              >
                <IconClose size={13} />
              </button>
            </span>
            <span className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>
              {attachment.description} · Verified by Grooveli
            </span>
          </div>
        ) : null}

        {error ? (
          <p role="alert" style={{ color: 'var(--g-danger)', fontSize: 'var(--g-text-sm)' }}>{error}</p>
        ) : null}

        <div className="composer__actions">
          <span className="g-dim" style={{ fontSize: 'var(--g-text-xs)' }}>
            Posting earns no XP — sharing is not career work.
          </span>
          <Button type="submit" variant="primary" loading={posting} disabled={!body.trim()}>
            Post
          </Button>
        </div>
      </form>
    </Panel>
  );
}
