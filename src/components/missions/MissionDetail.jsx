import { useState } from 'react';
import './missions.css';
import { Badge, Button, Panel, IconAward, IconCheck } from '../ui/index.js';
import { ObjectiveList } from './ObjectiveList.jsx';
import { useMissionStore } from '../../stores/missionStore.js';
import { useUiStore } from '../../stores/uiStore.js';
import * as missionService from '../../services/missionService.js';
import * as candidateService from '../../services/candidateService.js';
import { recordCareerEvent } from '../../stores/progression.js';
import { CAREER_EVENTS } from '../../utils/careerEvents.js';

/** Which skill a skill mission verifies when it is passed. */
const SKILL_FOR_CATEGORY = {
  excel: 'Excel',
  communication: 'Communication',
  recruitment: 'Recruitment',
  sales: 'Sales',
  interview: 'Communication',
};

/**
 * One mission, in full.
 *
 * Skill missions can be attempted here; career and discovery missions are
 * advanced by acting elsewhere in the product, which is the point — the mission
 * is a wrapper around real career activity, not a minigame.
 *
 * @param {{ mission: import('../../models/index.js').Mission, onNavigate?: (route:string)=>void }} props
 */
export function MissionDetail({ mission, onNavigate }) {
  const [attempt, setAttempt] = useState({ status: 'idle', result: null, error: null });
  const progress = useMissionStore((s) => s.progress[mission.id]);
  const pushToast = useUiStore((s) => s.pushToast);

  const complete = progress?.status === 'completed';
  const isSkillMission = mission.type === 'skill';

  const runChallenge = async () => {
    setAttempt({ status: 'running', result: null, error: null });
    try {
      const result = await missionService.runSkillChallenge(mission);
      setAttempt({ status: 'done', result, error: null });

      if (result.passed) {
        const skill = SKILL_FOR_CATEGORY[mission.category];
        // An interview mission completes through the interview event so the
        // "Get Your First Job" objective sees it too.
        recordCareerEvent(
          mission.category === 'interview'
            ? CAREER_EVENTS.INTERVIEW_SIMULATION_COMPLETED
            : CAREER_EVENTS.SKILL_CHALLENGE_COMPLETED,
          { label: `${mission.title} passed` },
        );
        if (skill) candidateService.verifySkill(skill, result.score).catch(() => {});
      } else {
        pushToast({
          title: 'Not quite',
          body: 'Have another go — the attempt is not held against you.',
          tone: 'warning',
        });
      }
    } catch (error) {
      setAttempt({ status: 'error', result: null, error });
    }
  };

  return (
    <div className="mission-detail">
      <div className="g-row" style={{ flexWrap: 'wrap' }}>
        <Badge tone={complete ? 'success' : 'accent'} dot>
          {complete ? 'Complete' : 'In progress'}
        </Badge>
        <Badge>{mission.difficulty}</Badge>
        <Badge>{mission.category}</Badge>
      </div>

      <p className="g-muted" style={{ lineHeight: 1.7 }}>
        {mission.description}
      </p>

      <section className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
        <h3 className="g-eyebrow">Objectives</h3>
        <ObjectiveList mission={mission} onNavigate={onNavigate} />
      </section>

      <div className="mission-detail__reward">
        <div className="g-row">
          <IconAward size={22} style={{ color: 'var(--g-accent)' }} />
          <div>
            <p style={{ fontFamily: 'var(--g-font-display)', fontWeight: 600 }}>
              +{mission.xpReward} XP
            </p>
            <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)' }}>
              {mission.reward ?? mission.unlocksLevel ?? 'Counts toward your career level'}
            </p>
          </div>
        </div>
        {complete ? <IconCheck size={22} style={{ color: 'var(--g-success)' }} /> : null}
      </div>

      {isSkillMission && !complete ? (
        <div className="g-stack" style={{ gap: 'var(--g-space-3)' }}>
          <Button variant="primary" size="lg" loading={attempt.status === 'running'} onClick={runChallenge}>
            {attempt.status === 'running' ? 'Scoring your attempt' : 'Start the challenge'}
          </Button>
          {attempt.status === 'error' ? (
            <p className="g-muted" style={{ color: 'var(--g-danger)', fontSize: 'var(--g-text-sm)' }}>
              {attempt.error?.message || 'The challenge could not be started. Try again.'}
            </p>
          ) : null}
        </div>
      ) : null}

      {attempt.result ? (
        <Panel pad="sm" className="mission-result">
          <div className="g-row-between">
            <span className="g-eyebrow">Result</span>
            <Badge tone={attempt.result.passed ? 'success' : 'warning'}>
              {attempt.result.passed ? 'Passed' : 'Not passed'}
            </Badge>
          </div>
          <p className="mission-result__score">{attempt.result.score}/100</p>
          <p className="g-muted" style={{ fontSize: 'var(--g-text-sm)', lineHeight: 1.6 }}>
            {attempt.result.feedback}
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
