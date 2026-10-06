import { useState } from 'react';
import './locations.css';
import {
  Panel,
  Badge,
  Button,
  AsyncBoundary,
  LoadingState,
  EmptyState,
  IconDoc,
  IconCheck,
} from '../ui/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useUiStore } from '../../stores/uiStore.js';
import * as learningService from '../../services/learningService.js';
import { recordCareerEvent } from '../../stores/progression.js';
import { CAREER_EVENTS } from '../../utils/careerEvents.js';

/** Courses at the Training Center. Completing one is worth a certification and 200 XP. */
export function CourseList() {
  const [completing, setCompleting] = useState(null);
  const [completed, setCompleted] = useState([]);
  const pushToast = useUiStore((s) => s.pushToast);
  const query = useAsync(() => learningService.listCourses(), []);

  const complete = async (course) => {
    setCompleting(course.id);
    try {
      await learningService.completeCourse(course.id);
      setCompleted((prev) => [...prev, course.id]);
      recordCareerEvent(CAREER_EVENTS.COURSE_COMPLETED, { label: `${course.title} completed` });
    } catch (error) {
      pushToast({ title: 'Could not record the course', body: error.message, tone: 'danger' });
    } finally {
      setCompleting(null);
    }
  };

  return (
    <AsyncBoundary
      query={query}
      loading={<LoadingState rows={3} label="Loading courses" />}
      errorTitle="Could not load courses"
      empty={<EmptyState title="No courses available" icon={<IconDoc size={22} />} />}
    >
      {(courses) => (
        <ul className="g-stack">
          {courses.map((course) => {
            const done = completed.includes(course.id);
            return (
              <li key={course.id}>
                <Panel pad="sm" className="course-card">
                  <div className="course-card__head">
                    <div style={{ minWidth: 0 }}>
                      <h3 className="course-card__title">{course.title}</h3>
                      <p className="course-card__provider">{course.provider}</p>
                    </div>
                    {done ? (
                      <Badge tone="success" dot>
                        Certified
                      </Badge>
                    ) : (
                      <Badge tone="accent">+{course.xpReward} XP</Badge>
                    )}
                  </div>

                  <p className="course-card__desc">{course.description}</p>

                  <div className="course-card__meta">
                    <Badge>{course.weeks} weeks</Badge>
                    <Badge>{course.level}</Badge>
                    <Badge>Builds {course.skill}</Badge>
                  </div>

                  <Button
                    size="sm"
                    variant={done ? 'ghost' : 'primary'}
                    disabled={done}
                    loading={completing === course.id}
                    onClick={() => complete(course)}
                    icon={done ? <IconCheck size={15} /> : null}
                  >
                    {done ? 'Completed' : 'Enrol and complete'}
                  </Button>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </AsyncBoundary>
  );
}
