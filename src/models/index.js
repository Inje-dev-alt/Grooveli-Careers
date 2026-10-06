/**
 * Grooveli frontend data contracts.
 *
 * These are the shapes the interface is written against. They are documented as
 * JSDoc typedefs rather than enforced at runtime: the backend owns the data, the
 * frontend only states what it expects to receive. Keep this file and
 * `docs/BACKEND_HANDOFF.md` in step — the handoff document is generated from the
 * same contracts by hand.
 *
 * Nothing here creates, persists or validates data.
 */

/** @typedef {'candidate' | 'employer' | 'admin'} UserRole */
/** @typedef {'full-time' | 'part-time' | 'contract' | 'internship' | 'freelance'} EmploymentType */
/** @typedef {'onsite' | 'hybrid' | 'remote'} WorkMode */
/** @typedef {'entry' | 'junior' | 'mid' | 'senior' | 'lead'} SeniorityLevel */
/** @typedef {'easy' | 'medium' | 'hard'} MissionDifficulty */
/** @typedef {'locked' | 'available' | 'active' | 'completed'} MissionStatus */
/**
 * @typedef {'draft' | 'submitted' | 'in-review' | 'interview' | 'offer' | 'rejected' | 'withdrawn'} ApplicationStatus
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {string} displayName
 * @property {UserRole} role
 * @property {string} [avatarUrl]
 * @property {string} createdAt       ISO 8601
 * @property {boolean} onboardingComplete
 */

/**
 * @typedef {Object} Skill
 * @property {string} id
 * @property {string} name
 * @property {string} category        e.g. "technology", "business"
 * @property {number} level           0-100, the candidate's self/assessed strength
 * @property {boolean} [verified]     true once a skill mission or assessment proved it
 */

/**
 * @typedef {Object} CandidateProfile
 * @property {string} id
 * @property {string} userId
 * @property {string} headline
 * @property {string} summary
 * @property {string} location
 * @property {number} yearsExperience
 * @property {WorkMode[]} workModes
 * @property {EmploymentType[]} openTo
 * @property {{ min: number, max: number, currency: string }} salaryExpectation
 * @property {Skill[]} skills
 * @property {string[]} industries
 * @property {{ hasCv: boolean, fileName?: string, updatedAt?: string }} cv
 * @property {number} completeness    0-100, drives the "complete your profile" mission
 */

/**
 * @typedef {Object} Company
 * @property {string} id
 * @property {string} name
 * @property {string} tagline
 * @property {string} description
 * @property {string} industry
 * @property {string} size            e.g. "50-200"
 * @property {string} location
 * @property {string} districtId      which Grooveli City district the company sits in
 * @property {string} [website]
 * @property {string} logoColor       token-friendly hex used by the generated logo tile
 * @property {number} openRoles
 */

/**
 * @typedef {Object} Employer
 * @property {string} id
 * @property {string} userId
 * @property {string} companyId
 * @property {string} role            the person's role at the company
 * @property {boolean} verified
 */

/**
 * @typedef {Object} Job
 * @property {string} id
 * @property {string} title
 * @property {string} companyId
 * @property {string} companyName     denormalised for list rendering
 * @property {string} districtId
 * @property {string} location
 * @property {WorkMode} workMode
 * @property {EmploymentType} employmentType
 * @property {SeniorityLevel} seniority
 * @property {{ min: number, max: number, currency: string, period: 'month' | 'year' }} salary
 * @property {string} summary
 * @property {string[]} responsibilities
 * @property {string[]} requirements
 * @property {string[]} skills
 * @property {number} matchScore      0-100, produced by the backend matching service
 * @property {string[]} matchReasons  human-readable "why this matched" lines
 * @property {string[]} skillGaps     skills the candidate is missing
 * @property {string} postedAt        ISO 8601
 * @property {boolean} featured
 */

/**
 * @typedef {Object} Application
 * @property {string} id
 * @property {string} jobId
 * @property {string} jobTitle
 * @property {string} companyName
 * @property {ApplicationStatus} status
 * @property {string} appliedAt       ISO 8601
 * @property {string} updatedAt       ISO 8601
 * @property {string} [note]
 * @property {Interview[]} [interviews]
 */

/**
 * @typedef {Object} Interview
 * @property {string} id
 * @property {string} applicationId
 * @property {string} companyName
 * @property {string} jobTitle
 * @property {'simulation' | 'screening' | 'technical' | 'final'} type
 * @property {string} scheduledAt     ISO 8601
 * @property {'scheduled' | 'completed' | 'cancelled'} status
 * @property {number} [score]         0-100 for completed simulations
 */

/**
 * @typedef {Object} MissionObjective
 * @property {string} id
 * @property {string} label
 * @property {string} [hint]
 * @property {string} event           the career event that completes this objective
 * @property {number} target          how many times the event must fire
 * @property {string} [actionLabel]   CTA shown on the objective row
 * @property {string} [actionRoute]   where the CTA sends the player
 */

/**
 * @typedef {Object} Mission
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {'career' | 'skill' | 'discovery'} type
 * @property {string} category        e.g. "excel", "communication"
 * @property {MissionDifficulty} difficulty
 * @property {number} xpReward
 * @property {string} [locationId]    where in the city the mission is offered
 * @property {string} [unlocksLevel]  career level granted on completion
 * @property {MissionObjective[]} objectives
 * @property {string} [reward]        human-readable non-XP reward
 */

/**
 * @typedef {Object} MissionProgress
 * @property {string} missionId
 * @property {MissionStatus} status
 * @property {Record<string, number>} objectiveCounts  objectiveId -> times completed
 * @property {string} [completedAt]
 */

/**
 * @typedef {Object} CareerStats
 * @property {number} level
 * @property {number} xp              total lifetime XP
 * @property {number} reputation      0-100
 * @property {number} completedMissions
 * @property {number} certifications
 * @property {number} applications
 * @property {number} interviews
 * @property {number} offers
 * @property {number} jobsViewed
 * @property {number} locationsVisited
 */

/**
 * @typedef {Object} Notification
 * @property {string} id
 * @property {'match' | 'application' | 'interview' | 'mission' | 'system'} type
 * @property {string} title
 * @property {string} body
 * @property {string} createdAt       ISO 8601
 * @property {boolean} read
 * @property {string} [route]         in-app destination opened when tapped
 */

/**
 * @typedef {Object} AIMessage
 * @property {string} id
 * @property {'user' | 'assistant'} role
 * @property {string} content
 * @property {string} createdAt       ISO 8601
 * @property {AISuggestedAction[]} [actions]
 * @property {{ jobIds?: string[], missionIds?: string[] }} [references]
 */

/**
 * @typedef {Object} AISuggestedAction
 * @property {string} id
 * @property {string} label
 * @property {string} intent          routed by the AI Career Center, never free text
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

export {};
