import { useState } from 'react';
import './social.css';
import { Panel, Badge, Button, TextInput, IconAward, IconCheck, IconBriefcase, IconAlert } from '../ui/index.js';
import { useSocialStore } from '../../stores/socialStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import * as socialService from '../../services/socialService.js';
import { formatRelativeTime, initials } from '../../utils/format.js';

const TYPE_LABEL = {
  achievement: 'Achievement',
  skill: 'Verified skill',
  advice: 'Advice',
  insight: 'Insight',
  opportunity: 'Opportunity',
  'company-update': 'Company update',
};

const ATTACHMENT_ICON = {
  achievement: IconAward,
  skill: IconCheck,
  job: IconBriefcase,
};

/**
 * One post.
 *
 * The attachment is the important part: a post carrying a verified assessment
 * score is career evidence, which is what makes this feed different from a
 * generic social timeline.
 *
 * Every post carries the two moderation verbs a real network cannot launch
 * without: report (a row for human review, never an instant takedown) and
 * block (this account only, immediate).
 *
 * @param {{ post: import('../../models/index.js').Post }} props
 */
export function PostCard({ post }) {
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleLike = useSocialStore((s) => s.toggleLike);
  const comment = useSocialStore((s) => s.comment);
  const blockAuthor = useSocialStore((s) => s.blockAuthor);
  const pushToast = useUiStore((s) => s.pushToast);

  const AttachmentIcon = post.attachment ? ATTACHMENT_ICON[post.attachment.kind] ?? IconAward : null;
  const isOrg = post.author.kind === 'organization';

  const submitComment = async (event) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await comment(post.id, draft);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  const report = async () => {
    setMenuOpen(false);
    try {
      await socialService.reportPost(post.id, 'inappropriate');
      pushToast({
        title: 'Reported',
        body: 'A person reviews every report. Thank you for keeping the network worth reading.',
        tone: 'info',
      });
    } catch (error) {
      pushToast({ title: 'Could not report', body: error.message, tone: 'danger' });
    }
  };

  const block = async () => {
    setMenuOpen(false);
    try {
      await blockAuthor(post.author.id);
      pushToast({ title: `Hidden ${post.author.name}`, body: 'You will not see their posts again.' });
    } catch (error) {
      pushToast({ title: 'Could not block', body: error.message, tone: 'danger' });
    }
  };

  return (
    <Panel pad="sm" className="post">
      <div className="post__head">
        <span
          className={`post__avatar${isOrg ? ' post__avatar--org' : ''}`}
          style={{ background: post.author.color }}
        >
          {initials(post.author.name)}
        </span>
        <div className="post__who">
          <span className="post__name">
            <span className="g-truncate">{post.author.name}</span>
            {post.author.verified ? (
              <IconCheck size={13} style={{ color: 'var(--g-accent)', flex: 'none' }} />
            ) : null}
          </span>
          <span className="post__headline g-truncate">{post.author.headline}</span>
        </div>
        <div className="g-row" style={{ gap: 8, flex: 'none' }}>
          <Badge>{TYPE_LABEL[post.type] ?? post.type}</Badge>
          <span className="post__time">{formatRelativeTime(post.createdAt)}</span>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="post__action"
              aria-label={`Moderation options for ${post.author.name}'s post`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              ···
            </button>
            {menuOpen ? (
              <div className="post__menu" role="menu">
                <button type="button" role="menuitem" className="post__menu-item" onClick={report}>
                  <IconAlert size={14} /> Report post
                </button>
                <button type="button" role="menuitem" className="post__menu-item" onClick={block}>
                  Hide {post.author.name}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <p className="post__body">{post.body}</p>

      {post.attachment ? (
        <div className="post__evidence">
          <span className="post__evidence-icon">
            <AttachmentIcon size={18} />
          </span>
          <span className="post__evidence-body">
            <span className="post__evidence-label">{post.attachment.label}</span>
            <span className="post__evidence-detail">
              {post.attachment.detail}
              {post.attachment.verified ? ' · Verified by Grooveli' : ''}
            </span>
          </span>
          {typeof post.attachment.score === 'number' ? (
            <span className="post__evidence-score">{post.attachment.score}%</span>
          ) : null}
        </div>
      ) : null}

      <div className="post__actions">
        <button
          type="button"
          className={`post__action${post.likedByMe ? ' post__action--active' : ''}`}
          aria-pressed={post.likedByMe}
          onClick={() => toggleLike(post.id)}
        >
          <IconCheck size={14} />
          {post.likeCount > 0 ? post.likeCount : ''} {post.likedByMe ? 'Liked' : 'Like'}
        </button>
        <button type="button" className="post__action" onClick={() => setCommenting((open) => !open)}>
          {post.comments.length > 0 ? post.comments.length : ''} Comment
          {post.comments.length === 1 ? '' : 's'}
        </button>
      </div>

      {post.comments.length > 0 ? (
        <div className="post__comments">
          {post.comments.map((entry) => (
            <div key={entry.id} className="post__comment">
              <span className="post__comment-avatar" style={{ background: entry.author.color }}>
                {initials(entry.author.name)}
              </span>
              <span className="post__comment-body">
                <span className="post__comment-name">{entry.author.name}</span>
                <span className="post__comment-text">{entry.body}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {commenting ? (
        <form className="post__comment-form" onSubmit={submitComment}>
          <TextInput
            value={draft}
            placeholder="Add a comment…"
            aria-label={`Comment on ${post.author.name}'s post`}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" variant="primary" size="sm" loading={sending} disabled={!draft.trim()}>
            Post
          </Button>
        </form>
      ) : null}
    </Panel>
  );
}