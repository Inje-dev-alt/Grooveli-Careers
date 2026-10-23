/**
 * Grooveli frontend data contracts.
 *
 * These are the shapes the interface is written against. They are documented as
 * JSDoc typedefs rather than enforced at runtime: the backend owns the data, the
 * frontend only states what it expects to receive. Keep this file and
 * `docs/BACKEND_HANDOFF.md` in step.
 *
 * The model is deliberately wider than the current MVP uses. Grooveli is a
 * marketplace with candidates, employers, companies, jobs, applications, a
 * professional network and AI on top — building today's screens against a
 * candidate-only model would force a rewrite the moment employers arrive.
 *
 * Nothing here creates, persists or validates data.
 */

/* ---------------------------------------------------------------- enums -- */

/** @typedef {'candidate' | 'employer' | 'admin'} UserRole */
/** @typedef {'full-time' | 'part-time' | 'contract' | 'internship' | 'freelance'} EmploymentType */
/** @typedef {'onsite' | 'hybrid' | 'remote'} WorkType */
/** @typedef {'entry' | 'junior' | 'mid' | 'senior' | 'lead'} ExperienceLevel */
/** @typedef {'easy' | 'medium' | 'hard'} MissionDifficulty */
/** @typedef {'locked' | 'available' | 'active' | 'completed'} MissionStatus */
/** @typedef {'draft' | 'published' | 'paused' | 'closed'} JobStatus */

/**
 * Where a job came from. The interface never branches on this — it consumes a
 * normalised Job — but the marketplace will eventually mix employer-created
 * roles with partner feeds, and the field has to exist before it does.
 * @typedef {'grooveli_employer' | 'workpedia' | 'partner' | 'mock'} JobSource
 */

/**
 * The full recruitment pipeline. The MVP only moves applications as far as
 * `shortlisted`, but the states a backend will need are named here so no screen
 * has to invent one.
 * @typedef {'applied' | 'under-review' | 'shortlisted' | 'interview' | 'assessment' | 'offer' | 'rejected' | 'withdrawn' | 'declined' | 'hired'} ApplicationStatus
 */

/** @typedef {'owner' | 'admin' | 'recruiter' | 'hiring-manager'} OrganizationRole */
/** @typedef {'achievement' | 'skill' | 'advice' | 'insight' | 'opportunity' | 'company-update'} PostType */

/* ----------------------------------------------------------- identity --- */

/**
 * One account, which may hold both capabilities.
 *
 * `roles` is an array and `activeRole` selects the current experience. A person
 * who hires and also looks for work is one user, not two accounts — assuming
 * otherwise is the single hardest thing to undo later.
 *
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {string} displayName
 * @property {UserRole[]} roles
 * @property {UserRole} activeRole
 * @property {string} [avatarUrl]       profile picture; multipart upload, monogram fallback
 * @property {string} createdAt                       ISO 8601
 * @property {string | null} candidateProfileId       null until candidate onboarding completes
 * @property {OrganizationMembership[]} organizationMemberships
 */

/**
 * @typedef {Object} OrganizationMembership
 * @property {string} organizationId
 * @property {string} organizationName
 * @property {OrganizationRole} role
 * @property {string} title            the person's job title at the organization
 * @property {string} joinedAt
 */

/**
 * @typedef {Object} Skill
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {number} level            0-100
 * @property {boolean} [verified]      true once an assessment or skill mission proved it
 * @property {number} [score]          assessment score backing the verification
 */

/**
 * @typedef {Object} ExperienceEntry
 * @property {string} id
 * @property {string} title
 * @property {string} organization
 * @property {string} startDate
 * @property {string} [endDate]        absent while current
 * @property {string} [summary]
 */

/**
 * @typedef {Object} EducationEntry
 * @property {string} id
 * @property {string} qualification
 * @property {string} institution
 * @property {string} [year]
 */

/** @typedef {'female' | 'male' | 'non-binary' | 'prefer-not-to-say'} Gender */

/**
 * @typedef {Object} CandidateProfile
 * @property {string} id
 * @property {string} userId
 * @property {string} headline
 * @property {string} summary
 * @property {string} location
 * @property {Gender} [gender]          optional, private — never surfaced to employers
 * @property {number} yearsExperience
 * @property {string} careerGoal
 * @property {string[]} careerInterests
 * @property {string} [careerPathId]    explicit home path (a career_paths id), pinned at onboarding; absent means inferred
 * @property {WorkType[]} workTypes
 * @property {EmploymentType[]} openTo
 * @property {{ min: number, max: number, currency: string }} salaryExpectation
 * @property {Skill[]} skills
 * @property {ExperienceEntry[]} experience
 * @property {EducationEntry[]} education
 * @property {string[]} industries
 * @property {{ hasCv: boolean, fileName?: string, updatedAt?: string }} cv
 * @property {number} completeness     0-100
 */

/* ------------------------------------------------------- organizations --- */

/**
 * The employer-side account. An Organization owns a company profile, members,
 * jobs and a social presence — Grooveli is not a one-way job board.
 *
 * @typedef {Object} Organization
 * @property {string} id
 * @property {string} name
 * @property {string} tagline
 * @property {string} description
 * @property {string} industry
 * @property {string} size             e.g. "50-200"
 * @property {string} location
 * @property {string} [website]
 * @property {string} districtId       which Grooveli City district it sits in
 * @property {string} logoColor        token-friendly hex for the generated tile
 * @property {string} [logoUrl]        company logo; multipart upload, monogram fallback
 * @property {number} followerCount
 * @property {boolean} verified
 * @property {string} createdAt
 */

/* ---------------------------------------------------------------- jobs --- */

/**
 * A normalised job. The frontend must not care where it came from.
 *
 * @typedef {Object} Job
 * @property {string} id
 * @property {string} organizationId
 * @property {string} companyName                 denormalised for list rendering
 * @property {string} title
 * @property {string} description
 * @property {number} salaryMin
 * @property {number} salaryMax
 * @property {string} currency                    ISO 4217
 * @property {'month' | 'year'} salaryPeriod
 * @property {string} location
 * @property {WorkType} workType
 * @property {EmploymentType} employmentType
 * @property {ExperienceLevel} experienceLevel
 * @property {string[]} requiredSkills
 * @property {string[]} preferredSkills
 * @property {string} industry
 * @property {string} districtId
 * @property {string} [deadline]                  ISO 8601
 * @property {JobStatus} status
 * @property {JobSource} source
 * @property {string} createdAt
 * @property {string[]} responsibilities
 * @property {string[]} requirements
 * @property {boolean} featured
 * @property {number} [matchScore]                0-100, from the matching service
 * @property {string[]} [matchReasons]            human-readable "why this matched"
 * @property {string[]} [skillGaps]
 */

/**
 * @typedef {Object} Application
 * @property {string} id
 * @property {string} jobId
 * @property {string} jobTitle
 * @property {string} organizationId
 * @property {string} companyName
 * @property {string} candidateId
 * @property {ApplicationStatus} status
 * @property {string} appliedAt
 * @property {string} updatedAt
 * @property {string} [stageEnteredAt]  when the current status began
 * @property {string} [note]            the candidate's note at submission
 * @property {string} [feedback]        why a rejection happened, from the employer
 * @property {boolean} [rejectionAcknowledged] set once the candidate has seen the rejection
 * @property {boolean} [seeded]         fixture history the pipeline simulation must not touch
 */

/**
 * One stage transition on an application - the timeline the candidate sees
 * and the audit trail the backend keeps.
 *
 * @typedef {Object} ApplicationEvent
 * @property {string} id
 * @property {string} applicationId
 * @property {ApplicationStatus | null} fromStatus
 * @property {ApplicationStatus} toStatus
 * @property {'candidate' | 'employer' | 'system'} actor
 * @property {string | null} note        feedback where the move carried one
 * @property {string} at
 */

/**
 * @typedef {Object} Interview
 * @property {string} id
 * @property {string} userId             whose interview this is
 * @property {string} applicationId
 * @property {string} companyName
 * @property {string} jobTitle
 * @property {'simulation' | 'screening' | 'technical' | 'final'} type
 * @property {string} scheduledAt
 * @property {'scheduled' | 'completed' | 'cancelled'} status
 * @property {number} [score]
 */

/* ------------------------------------------------------------ missions --- */

/**
 * @typedef {Object} MissionObjective
 * @property {string} id
 * @property {string} label
 * @property {string} [hint]
 * @property {string} event           the career event that completes this objective
 * @property {number} target
 * @property {{ key: string, value: string } | null} [context]
 *           which event of that type counts. Null or absent means any one does.
 *           Four skill missions listen for `skill.challenge` and each names its
 *           own skill this way; shaped and matched exactly like an
 *           Achievement's `context`.
 * @property {string} [actionLabel]
 * @property {string} [actionRoute]
 */

/**
 * @typedef {Object} Mission
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {'career' | 'skill' | 'discovery'} type
 * @property {string} category
 * @property {MissionDifficulty} difficulty
 * @property {number} xpReward
 * @property {string} [locationId]
 * @property {string} [pathId]           when set, this mission belongs to that career path's chain and is only served to matching accounts
 * @property {MissionObjective[]} objectives
 * @property {string} [reward]
 */

/**
 * @typedef {Object} MissionProgress
 * @property {string} missionId
 * @property {MissionStatus} status
 * @property {Record<string, number>} objectiveCounts
 * @property {string} [completedAt]
 * @property {string} [lastRemindedAt]  last mission-reminder notice, for the 24h rule
 */

/* ------------------------------------------------------------- career --- */

/**
 * XP measures progression. Reputation measures professional credibility. They
 * are deliberately separate numbers: one is earned by doing career work, the
 * other will eventually be derived from verified achievements, assessments and
 * employer feedback.
 *
 * @typedef {Object} CareerProgress
 * @property {number} xp
 * @property {number} level
 * @property {number} reputation      0-100
 */

/**
 * @typedef {Object} CareerStats
 * @property {number} completedMissions
 * @property {number} certifications
 * @property {number} applications
 * @property {number} interviews
 * @property {number} offers
 * @property {number} jobsViewed
 * @property {number} locationsVisited
 */

/**
 * @typedef {Object} Achievement
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} icon
 * @property {boolean} earned
 * @property {string} [earnedAt]
 * @property {string} [event]         the career event that earns it
 * @property {number} [count]         how many times the event must fire (default 1)
 * @property {{ key: string, value: string }} [context] event payload the award demands, e.g. the skill name
 * @property {number} [progress]      how far toward `count` the account has come
 * @property {number} [score]         assessment score, where one backs it
 * @property {boolean} [verified]
 */

/**
 * One entry in the career activity stream. This is the raw material for social
 * proof: a record of career work, not of engagement.
 *
 * @typedef {Object} CareerActivity
 * @property {string} id
 * @property {string} userId
 * @property {string} type            mirrors the career event vocabulary
 * @property {string} label
 * @property {number} [xp]
 * @property {string} createdAt
 * @property {boolean} shareable
 */

/* ------------------------------------------------------------- social --- */

/**
 * One of the ten launch careers. Owned by the backend (`GET /career-paths`);
 * the frontend catalog mirrors it. Career interests, Discovery matches and
 * interview banks all key off `title`, so renaming a path renames it
 * everywhere — add a path by adding a row, never by editing a screen.
 *
 * @typedef {Object} CareerPath
 * @property {string} id
 * @property {string} title
 * @property {string} districtId        where this career lives in Grooveli City
 * @property {string} tagline           one line for cards and the landing page
 * @property {string} summary           the honest pitch: what the work is
 * @property {string[]} core            skills the path is built on
 * @property {string[]} growth          skills that accelerate the path
 * @property {string} interviewBankId   question bank for interview simulations
 */

/**
 * One sitting of an interview simulation. The pass rule is binary and lives
 * here, not in the UI: two correct answers pass, two wrong answers fail.
 * Only a pass earns `interview.simulated`, its XP and the Interview Ready
 * badge — an exam that cannot be failed certifies nothing.
 *
 * @typedef {Object} InterviewAttempt
 * @property {string} id
 * @property {string} userId
 * @property {string} pathId            the career path the questions came from
 * @property {string} pathTitle
 * @property {string} jobTitle
 * @property {{ questionId: string, optionIndex: number, correct: boolean, at: string }[]} answers
 * @property {number} correctCount
 * @property {number} wrongCount
 * @property {'in-progress' | 'passed' | 'failed'} status
 * @property {boolean | null} passed
 * @property {number | null} score     correct / answered, as a percentage
 * @property {string} startedAt
 * @property {string | null} completedAt
 */

/**
 * @typedef {Object} PostAuthor
 * @property {string} id
 * @property {'user' | 'organization'} kind
 * @property {string} name
 * @property {string} [headline]
 * @property {string} color
 * @property {boolean} [verified]
 */

/**
 * @typedef {Object} PostAttachment
 * @property {'achievement' | 'skill' | 'job'} kind
 * @property {string} refId
 * @property {string} label
 * @property {string} [detail]
 * @property {number} [score]
 * @property {boolean} [verified]
 */

/**
 * @typedef {Object} Post
 * @property {string} id
 * @property {PostAuthor} author
 * @property {PostType} type
 * @property {string} body
 * @property {PostAttachment} [attachment]
 * @property {number} likeCount
 * @property {boolean} likedByMe
 * @property {Comment[]} comments
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Comment
 * @property {string} id
 * @property {string} postId
 * @property {PostAuthor} author
 * @property {string} body
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Connection
 * @property {string} id
 * @property {string} userId
 * @property {'pending' | 'connected'} status
 * @property {string} createdAt
 */

/* ----------------------------------------------------------------- ai --- */

/**
 * @typedef {Object} AISuggestedAction
 * @property {string} id
 * @property {string} label
 * @property {string} intent
 */

/**
 * @typedef {Object} AIMessage
 * @property {string} id
 * @property {'user' | 'assistant'} role
 * @property {string} content
 * @property {string} createdAt
 * @property {AISuggestedAction[]} [actions]
 * @property {{ jobIds?: string[], missionIds?: string[] }} [references]
 */

/**
 * @typedef {Object} AIConversation
 * @property {string} id
 * @property {string} userId
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {AIMessage[]} messages
 */

/**
 * @typedef {Object} AIBriefing
 * @property {string} greeting
 * @property {{ id: string, label: string, value: number, route?: string }[]} highlights
 * @property {string} question
 * @property {AISuggestedAction[]} actions
 */

/**
 * The single recommended next step. The product should always have an answer to
 * "what should I do next, and why".
 *
 * @typedef {Object} NextCareerAction
 * @property {string} id
 * @property {string} title
 * @property {string} reason
 * @property {number} xp
 * @property {string} actionLabel
 * @property {string} route
 * @property {string} [intent}
 */

/**
 * @typedef {Object} CareerMatch
 * @property {string} id
 * @property {string} title
 * @property {number} matchScore
 * @property {string[]} strengths
 * @property {string[]} gaps
 * @property {string} summary
 */


/* -------------------------------------------- network and standings --- */

/**
 * A referral request: one person vouches for a candidate to an employer.
 *
 * @typedef {Object} Referral
 * @property {string} id
 * @property {string} referrerUserId
 * @property {string} referrerName
 * @property {string} applicantUserId
 * @property {string} applicationId
 * @property {string} jobTitle
 * @property {string} companyName
 * @property {'requested' | 'sent' | 'declined'} status
 * @property {string} createdAt
 */

/**
 * A report raised against a post. Reports are rows for human review - a
 * reporting system that acts on the first click is a harassment weapon.
 *
 * @typedef {Object} Report
 * @property {string} id
 * @property {string} postId
 * @property {string} reporterUserId
 * @property {string} authorId
 * @property {string} reason
 * @property {'open' | 'reviewing' | 'actioned' | 'dismissed'} status
 * @property {string} createdAt
 */

/**
 * One row on the plaza board. Ranked by reputation, never by XP - a board
 * ranked by activity becomes a farming contest.
 *
 * @typedef {Object} LeaderboardEntry
 * @property {number} rank
 * @property {string} id
 * @property {string} name
 * @property {string} headline
 * @property {number} careerLevel
 * @property {number} reputation
 * @property {string} color
 * @property {boolean} isMe
 */

/**
 * A course enrolment. A course can only be completed once; the row is the
 * evidence, and the certification count is a fact about the account.
 *
 * @typedef {Object} CourseEnrollment
 * @property {string} id
 * @property {string} courseId
 * @property {'enrolled' | 'completed'} status
 * @property {string} [enrolledAt]
 * @property {string | null} completedAt
 */

/**
 * Evidence that a skill was proved, and by what. Without this row,
 * `verified` is a claim; with it, an employer can see the trail.
 *
 * @typedef {Object} SkillAssessment
 * @property {string} id
 * @property {string} profileId
 * @property {string} skillName
 * @property {'ai-assessment' | 'mission' | 'course'} kind
 * @property {string} [refId]        the mission or course that produced it
 * @property {number} score
 * @property {string} occurredAt
 */

/**
 * @typedef {Object} Notification
 * @property {string} id
 * @property {string} userId          whose inbox this is
 * @property {'match' | 'application' | 'interview' | 'mission' | 'mission-reminder' | 'system'} type
 * @property {string} title
 * @property {string} body
 * @property {boolean} read
 * @property {string} [route]
 * @property {string} createdAt
 */

/**
 * Reminder preferences: mission nudges on or off, with an optional quiet
 * window in 24h hours. The mock cannot run cron, so the UI evaluates
 * `dueMissionReminders` on load; the backend runs the same rule on a
 * scheduler and writes notification rows.
 *
 * @typedef {Object} NotificationPreferences
 * @property {boolean} missionReminders
 * @property {{ start: number, end: number } | null} quietHours
 */

/**
 * HR analytics for one organization, computed from its real application and
 * job rows. Match buckets share fixed boundaries so the backend owns them.
 *
 * @typedef {Object} HiringAnalytics
 * @property {number} applications
 * @property {Record<string, number>} byStage
 * @property {number} avgDaysInStage
 * @property {Record<string, number>} sourceMix
 * @property {{ '0-39': number, '40-59': number, '60-79': number, '80-100': number, unscored: number }} matchBuckets
 */

export {};
