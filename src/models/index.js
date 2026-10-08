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
 * @typedef {'applied' | 'under-review' | 'shortlisted' | 'interview' | 'assessment' | 'offer' | 'rejected' | 'withdrawn' | 'hired'} ApplicationStatus
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
 * @property {string} [avatarUrl]
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

/**
 * @typedef {Object} CandidateProfile
 * @property {string} id
 * @property {string} userId
 * @property {string} headline
 * @property {string} summary
 * @property {string} location
 * @property {number} yearsExperience
 * @property {string} careerGoal
 * @property {string[]} careerInterests
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
 * @property {string} [note]
 */

/**
 * @typedef {Object} Interview
 * @property {string} id
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
 * @property {MissionObjective[]} objectives
 * @property {string} [reward]
 */

/**
 * @typedef {Object} MissionProgress
 * @property {string} missionId
 * @property {MissionStatus} status
 * @property {Record<string, number>} objectiveCounts
 * @property {string} [completedAt]
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

export {};
