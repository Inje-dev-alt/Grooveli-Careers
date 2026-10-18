/**
 * Interview question banks, one per career path plus a general pool.
 *
 * The simulation plays four questions and is graded first-to-two:
 * two correct answers pass, two wrong answers fail. Questions are multiple
 * choice so the mock grades honestly - the backend re-owns this table
 * (`interview_questions`) and the same pass rule under `POST /interviews/*`.
 *
 * Rationales matter: every answer explains itself, because the point of a
 * practice interview is the feedback, not the score.
 *
 * @typedef {Object} InterviewQuestion
 * @property {string} id
 * @property {string} question
 * @property {string[]} options
 * @property {number} answerIndex
 * @property {string} rationale
 */

/** @type {Record<string, InterviewQuestion[]>} */
export const INTERVIEW_BANKS = {
  /* Human Resources - includes the shortlist scenario: the HR-specific way of
     "determining a pass", reasoning against a brief rather than taste. */
  'bank-hr': [
    {
      id: 'hr-1',
      question: 'A hiring manager asks you to fill a role in five days. What do you say first?',
      options: [
        'Agree, then work nights to deliver',
        'Ask what success looks like, then trade scope for time',
        'Say no - five days is impossible',
        'Post the job and hope',
      ],
      answerIndex: 1,
      rationale: 'Anchor on the outcome, then negotiate scope or timeline. Agreeing first trains the stakeholder to keep doing it.',
    },
    {
      id: 'hr-2',
      question: 'Four candidates apply for a backend role. Which shortlist decision is defensible?',
      options: [
        'Shortlist the two with the best university names',
        'Shortlist everyone who applied - fairness means no cuts',
        'Shortlist two against the brief\'s must-haves and write down why the others missed it',
        'Shortlist the two with the most total years',
      ],
      answerIndex: 2,
      rationale: 'A shortlist is a judgement against the brief, written down. Prestige and tenure are proxies; the brief is the standard you can defend.',
    },
    {
      id: 'hr-3',
      question: 'A candidate asks for salary far above the band. What is the honest response?',
      options: [
        'Promise you will try to get it approved',
        'State the band, ask what they need to see to be comfortable, and keep the process moving',
        'End the conversation - they are out of range',
        'Invent a higher band to keep them warm',
      ],
      answerIndex: 1,
      rationale: 'State reality, explore the gap, keep the process honest. Candidates remember how a process treated them long after the result.',
    },
    {
      id: 'hr-4',
      question: 'Two interviewers score the same candidate differently. What resolves it?',
      options: [
        'Average the scores and move on',
        'The senior interviewer decides',
        'Compare notes against the same criteria and record the evidence behind the call',
        'Re-interview until you get agreement',
      ],
      answerIndex: 2,
      rationale: 'Disagreement usually means unclear criteria, not a bad candidate. Re-anchoring on evidence fixes both the decision and the scorecard.',
    },
    {
      id: 'hr-5',
      question: 'What makes an effective exit interview worth running?',
      options: [
        'It changes nothing but checks a box',
        'Patterns across leavers surface real problems while they are still fixable',
        'It is a chance to negotiate them back',
        'Legal requirement in every company',
      ],
      answerIndex: 1,
      rationale: 'One exit interview is an anecdote; a pattern across them is the most honest survey a company will ever get.',
    },
  ],

  'bank-software': [
    {
      id: 'sw-1',
      question: 'A deploy broke production. First move?',
      options: [
        'Find who pushed the bad commit',
        'Roll back to the last known good release, then investigate',
        'Hot-fix forward as fast as possible',
        'Write the post-mortem before acting',
      ],
      answerIndex: 1,
      rationale: 'Restore service first, learn second. Blame and forensics both wait until users are whole.',
    },
    {
      id: 'sw-2',
      question: 'A teammate\'s PR has a subtle bug in a hot path. What do you do?',
      options: [
        'Approve with a comment and move on',
        'Fix it yourself on their branch without a word',
        'Request changes with a concrete example of the failure and why it matters',
        'Merge it - the test suite will catch it later',
      ],
      answerIndex: 2,
      rationale: 'Review is where correctness is cheapest. Specific beats vague, and a suggested fix beats both.',
    },
    {
      id: 'sw-3',
      question: 'Which database index fits a query that filters by tenant and sorts by created_at?',
      options: [
        'Index on created_at alone',
        'Composite index on (tenant_id, created_at)',
        'Index on every column separately',
        'No index - the planner will figure it out',
      ],
      answerIndex: 1,
      rationale: 'Composite in the order you filter then sort. Separate indexes rarely combine the way you hope.',
    },
    {
      id: 'sw-4',
      question: 'A feature works locally but fails in staging. What do you check first?',
      options: [
        'Rewrite the feature',
        'Environment differences: config, secrets, data shape, service versions',
        'Blame the staging server',
        'Merge locally again and hope',
      ],
      answerIndex: 1,
      rationale: 'The code is the same; the environment is not. Diff the environment before you diff the logic.',
    },
    {
      id: 'sw-5',
      question: 'What is the strongest signal a piece of code is ready to merge?',
      options: [
        'It compiles without warnings',
        'The author understands every line and can explain the trade-offs',
        'The ticket is marked urgent',
        'It has been open for more than a day',
      ],
      answerIndex: 1,
      rationale: 'Ownership of the change is the real gate. Code nobody can explain becomes code nobody can safely change.',
    },
  ],

  'bank-ai': [
    {
      id: 'ai-1',
      question: 'A model answers confidently but wrongly. What is the first fix to try?',
      options: [
        'Increase the temperature',
        'Ground it: retrieval over your own documents, with citations',
        'Switch to a bigger model immediately',
        'Add a disclaimer to the output',
      ],
      answerIndex: 1,
      rationale: 'Confident wrongness is usually missing grounding, not missing size. Evidence in the prompt fixes more than parameters do.',
    },
    {
      id: 'ai-2',
      question: 'How do you evaluate a prompt change before shipping it?',
      options: [
        'A few examples by eye is enough',
        'A fixed evaluation set with scoring, run before and after',
        'Ship it and watch for complaints',
        'Ask the model if the change is good',
      ],
      answerIndex: 1,
      rationale: 'Without a repeatable eval set, prompt work is vibes. Measure on cases that broke before you claim it is fixed.',
    },
    {
      id: 'ai-3',
      question: 'An AI agent should call a tool that submits a job application when…',
      options: [
        'The user mentions applying at all',
        'The intent is clear and the user has explicitly confirmed the action',
        'Confidence score is above 90%',
        'The agent has nothing better to suggest',
      ],
      answerIndex: 1,
      rationale: 'Consequential actions require explicit confirmation. Intent detection routes; the human authorises.',
    },
    {
      id: 'ai-4',
      question: 'Retrieval keeps returning documents that are similar but irrelevant. Best lever?',
      options: [
        'Add more documents to the corpus',
        'Improve chunking and query rewriting before touching the embedding model',
        'Raise the top-k to 50',
        'Switch embedding models weekly',
      ],
      answerIndex: 1,
      rationale: 'Garbage in chunks is garbage in context. Structure of retrieval beats swapping the model underneath it.',
    },
    {
      id: 'ai-5',
      question: 'What is the safest default when a model output will drive a real decision?',
      options: [
        'Trust it - models are accurate now',
        'Show the reasoning, log the input/output, and keep a human in the loop',
        'Hide the output so users are not confused',
        'Run it twice and average',
      ],
      answerIndex: 1,
      rationale: 'Legibility plus a human checkpoint. Silent automation of real decisions is how AI incidents are born.',
    },
  ],

  'bank-social': [
    {
      id: 'soc-1',
      question: 'A post underperforms badly. What do you examine first?',
      options: [
        'Delete it immediately',
        'The hook, timing and audience fit - then re-cut the idea rather than repost blindly',
        'Buy followers to lift the account',
        'Post the same thing again tomorrow',
      ],
      answerIndex: 1,
      rationale: 'One data point is a diagnosis opportunity, not a verdict. Hook and timing explain most underperformance.',
    },
    {
      id: 'soc-2',
      question: 'The brand gets a critical comment going viral. First response?',
      options: [
        'Delete and block',
        'Ignore it - engagement is engagement',
        'Acknowledge publicly, take specifics to DM, and loop in the team that owns the issue',
        'Argue the point in replies',
      ],
      answerIndex: 2,
      rationale: 'Acknowledge fast, resolve offline, fix the root cause. Deleting reads as guilt; arguing reads as defensiveness.',
    },
    {
      id: 'soc-3',
      question: 'What makes a content calendar survive contact with a real week?',
      options: [
        'More posts per day',
        'Pillars plus a re-use plan: every asset earns twice',
        'Rigid daily themes never broken',
        'Posting only when inspired',
      ],
      answerIndex: 1,
      rationale: 'Pillars give structure; re-use gives runway. Rigid calendars break; inspiration does not scale.',
    },
    {
      id: 'soc-4',
      question: 'Which metric best proves social work to a sceptical finance lead?',
      options: [
        'Follower count',
        'Reach and engagement rate',
        'Assisted conversions and inbound conversations attributed to social',
        'How many posts went out',
      ],
      answerIndex: 2,
      rationale: 'Finance speaks outcomes. Follower counts are vanity; attributed conversations are the bridge to revenue.',
    },
    {
      id: 'soc-5',
      question: 'A campaign needs both a brand voice and a hard deadline. What wins when they conflict?',
      options: [
        'Brand voice - consistency is everything',
        'The deadline - marketing is a business function',
        'Neither: renegotiate the deadline or the scope with clear reasons',
        'Split the difference and do both badly',
      ],
      answerIndex: 2,
      rationale: 'Trade-offs get named and escalated, not absorbed silently. The best marketers renegotiate instead of quietly compromising both.',
    },
  ],

  'bank-marketing': [
    {
      id: 'mkt-1',
      question: 'A paid campaign has clicks but zero conversions. Where do you look?',
      options: [
        'Raise the budget',
        'Landing page message match, offer clarity and form friction before touching the ads',
        'Switch ad platforms',
        'Pause everything',
      ],
      answerIndex: 1,
      rationale: 'Traffic without conversion is usually a landing problem. Fix the page before you buy more of the same click.',
    },
    {
      id: 'mkt-2',
      question: 'What does a good test hypothesis look like?',
      options: [
        'Try the button in green',
        'Because first-time visitors are unclear on pricing, showing it early will raise qualified signups',
        'The competitor changed their homepage',
        'Marketing feels the copy is stale',
      ],
      answerIndex: 1,
      rationale: 'A hypothesis names who, why and the predicted movement. Without it, tests are randomised redecorating.',
    },
    {
      id: 'mkt-3',
      question: 'Open rates drop across a whole list overnight. Most likely cause?',
      options: [
        'Content fatigue',
        'A deliverability problem: authentication, reputation or a provider issue',
        'Wrong send time',
        'Subject lines got worse in one day',
      ],
      answerIndex: 1,
      rationale: 'Sudden, list-wide drops are infrastructure, not editorial. Check SPF/DKIM/DMARC and reputation first.',
    },
    {
      id: 'mkt-4',
      question: 'Which channel should get the next tranche of budget?',
      options: [
        'Whichever has the most impressions',
        'The one with the lowest measured cost per qualified outcome at current scale',
        'Whatever the CEO saw at a conference',
        'The newest platform',
      ],
      answerIndex: 1,
      rationale: 'Marginal cost per qualified outcome decides. Impressions and novelty are not outcomes.',
    },
    {
      id: 'mkt-5',
      question: 'SEO results are flat after three months of work. Your call?',
      options: [
        'Abandon SEO',
        'Audit whether the work targeted intent anyone searches, then escalate to content that matches demand',
        'Buy backlinks',
        'Rewrite every page randomly',
      ],
      answerIndex: 1,
      rationale: 'Flat results are usually wrong-intent work. Search demand is the strategy; tactics follow it.',
    },
  ],

  'bank-design': [
    {
      id: 'des-1',
      question: 'Stakeholders disagree on a flow. What moves it forward?',
      options: [
        'A vote - majority rules',
        'The person with the loudest voice',
        'Return to the user problem and the evidence each option serves',
        'Design all three and ship one at random',
      ],
      answerIndex: 2,
      rationale: 'Taste arguments end when the shared problem is restated. Evidence beats seniority, and votes measure politics.',
    },
    {
      id: 'des-2',
      question: 'What belongs in a design case study?',
      options: [
        'Only the final polished screens',
        'The problem, constraints, options considered, the decision and its measured result',
        'Every iteration, unfiltered',
        'The tools used and hours spent',
      ],
      answerIndex: 1,
      rationale: 'Portfolio readers hire judgement, not screenshots. Decisions and outcomes are the evidence.',
    },
    {
      id: 'des-3',
      question: 'A redesign ships and task completion drops. First move?',
      options: [
        'Revert immediately',
        'Blame the users for not adapting',
        'Instrument the failing step, watch real sessions, and fix that step',
        'Redesign it again from scratch',
      ],
      answerIndex: 2,
      rationale: 'Find the break before choosing the fix. Sessions tell you where confusion actually lives.',
    },
    {
      id: 'des-4',
      question: 'How should a design system decide when a new component is allowed?',
      options: [
        'Any team can add one freely',
        'Only designers may add components',
        'It must be a repeating pattern with at least two real use cases and a named owner',
        'Never - use variants only',
      ],
      answerIndex: 2,
      rationale: 'Two real use cases prevent component sprawl; ownership keeps it maintained. Both constraints together.',
    },
    {
      id: 'des-5',
      question: 'Accessibility in design handoff means…',
      options: [
        'A checkbox the engineer owns',
        'Contrast, focus order, labels and touch targets specified so it cannot be skipped downstream',
        'Adding alt text at the end',
        'Only a compliance requirement',
      ],
      answerIndex: 1,
      rationale: 'Accessibility decided at build time costs ten times more. Specified constraints travel; checkboxes do not.',
    },
  ],

  'bank-motion': [
    {
      id: 'mot-1',
      question: 'What makes an interface animation feel intentional rather than decorative?',
      options: [
        'Longer durations',
        'It follows easing that matches the physical metaphor and guides attention',
        'More movement on screen',
        'Bouncing easing on everything',
      ],
      answerIndex: 1,
      rationale: 'Motion earns its place by explaining causality. Ease-in-out reads as weight; arbitrary bounce reads as toy.',
    },
    {
      id: 'mot-2',
      question: 'A brand wants a 30-second product film but only 15 seconds of footage exist. Best move?',
      options: [
        'Stretch every clip to fill time',
        'Add a stock library wholesale',
        'Cut to the strongest 15 seconds and rebuild the story around the constraint',
        'Add more text cards',
      ],
      answerIndex: 2,
      rationale: 'Story length follows material, not the other way round. Padding footage is how films lose their pulse.',
    },
    {
      id: 'mot-3',
      question: 'Delivery day is tomorrow and After Effects keeps crashing on a comp. What do you do?',
      options: [
        'Keep retrying the same approach all night',
        'Pre-compose the heavy layers, proxy the footage and keep a rendered backup path ready',
        'Deliver nothing - quality matters',
        'Lower quality silently and say nothing',
      ],
      answerIndex: 1,
      rationale: 'Professional motion is production discipline: proxies, pre-comps and fallback renders beat heroics. Silence about quality is the only bad option.',
    },
    {
      id: 'mot-4',
      question: 'What is the correct review loop for motion in a design system?',
      options: [
        'Animate first, discuss later',
        'Timing and easing specs agreed with design, then implementation against those specs',
        'Engineering invents the motion',
        'No review - motion is taste',
      ],
      answerIndex: 1,
      rationale: 'Specified motion (duration, easing, trigger) ships consistently; improvised motion drifts across every screen.',
    },
    {
      id: 'mot-5',
      question: 'Which file handoff do frontend engineers actually prefer?',
      options: [
        'A video recording of the animation',
        'Tokenised durations and easings plus an exported reference',
        'A PSD with notes',
        'A verbal walkthrough',
      ],
      answerIndex: 1,
      rationale: 'Engineers build from values, not from watching. Tokens drop straight into CSS variables.',
    },
  ],

  'bank-video': [
    {
      id: 'vid-1',
      question: 'A client says a cut is boring but cannot say why. What do you ask?',
      options: [
        'Should I add more effects?',
        'Where did you stop paying attention, and what did you expect to happen instead?',
        'Do you want a different music track?',
        'Which competitor version do you prefer?',
      ],
      answerIndex: 1,
      rationale: 'Locate the moment, then diagnose pacing, content or structure. Vague notes become specific at a timestamp.',
    },
    {
      id: 'vid-2',
      question: 'Short-form retention drops hardest in the first two seconds. What holds it?',
      options: [
        'A logo sting first',
        'A pattern interrupt that promises the payoff, with the hook on screen immediately',
        'A slow build-up of context',
        'Credits at the top',
      ],
      answerIndex: 1,
      rationale: 'The open earns the next second. Promise the payoff visibly before the viewer can scroll.',
    },
    {
      id: 'vid-3',
      question: 'Colour grading a dialogue scene across two cameras that do not match?',
      options: [
        'Grade them separately until each looks best',
        'Match exposure and white balance on the primary camera first, then grade both to that reference',
        'Hide it with a LUT preset',
        'Add a filter over the whole sequence',
      ],
      answerIndex: 1,
      rationale: 'Reference-first: one anchor camera, everything matched to it. Per-shot beautification makes the mismatch worse.',
    },
    {
      id: 'vid-4',
      question: 'Three rounds of revisions are eating the project margin. What protects it?',
      options: [
        'Work faster quietly',
        'Scope rounds in the quote, then charge for rounds beyond it - stated up front',
        'Refuse further feedback',
        'Raise the price silently mid-project',
      ],
      answerIndex: 1,
      rationale: 'Revision limits in the agreement, stated before work begins, are professional - not adversarial.',
    },
    {
      id: 'vid-5',
      question: 'What makes an edit actually finish?',
      options: [
        'Every effect the timeline allows',
        'Nothing left to remove - pacing, audio levels and colour are consistent and the story lands',
        'The client runs out of comments',
        'The file reaches a target size',
      ],
      answerIndex: 1,
      rationale: 'Editing is subtraction. Consistency across picture and sound is what separates finished from abandoned.',
    },
  ],

  'bank-support': [
    {
      id: 'sup-1',
      question: 'A customer is angry about a bug that is not your fault. Open with?',
      options: [
        'Explain immediately that it is not your team',
        'Acknowledge the impact, own the next step, then explain cause later',
        'Send the documentation link',
        'Escalate before replying',
      ],
      answerIndex: 1,
      rationale: 'People need ownership before explanations. Cause matters once they believe someone is moving.',
    },
    {
      id: 'sup-2',
      question: 'The same issue hits twenty customers today. What separates good from great?',
      options: [
        'Answering all twenty identically',
        'A templated fast reply plus one clear report to product with reproduction steps',
        'Closing tickets quickly',
        'Waiting for a product fix before replying',
      ],
      answerIndex: 1,
      rationale: 'Support at volume is a feedback channel. The report you send upstream saves the next twenty tickets.',
    },
    {
      id: 'sup-3',
      question: 'A request is impossible today. What do you say?',
      options: [
        'No - and end the chat',
        'Maybe - and disappear to check',
        'What is possible now, when the rest might be, and that you will follow up at a named time',
        'Promise it will ship next month',
      ],
      answerIndex: 2,
      rationale: 'Honesty plus a deadline you keep. Overpromising converts a hard no into a broken trust later.',
    },
    {
      id: 'sup-4',
      question: 'A customer asks for a refund on a policy that forbids refunds. Right move?',
      options: [
        'Quote the policy word for word',
        'Waive the policy every time',
        'Acknowledge, explain the boundary plainly, and offer the best alternative you actually control',
        'Blame the policy page',
      ],
      answerIndex: 2,
      rationale: 'Boundaries stated warmly and paired with a real alternative preserve the relationship and the policy.',
    },
    {
      id: 'sup-5',
      question: 'What does good ticket hygiene look like?',
      options: [
        'One mega-thread per customer',
        'Clear subject, status, next action and owner on every ticket, always',
        'Closing everything old',
        'Internal notes only',
      ],
      answerIndex: 1,
      rationale: 'Tickets are a shared memory. Subject, status, next action, owner - anyone should be able to pick it up cold.',
    },
  ],

  'bank-va': [
    {
      id: 'va-1',
      question: 'Your principal asks for two things at once, both due now. What do you do?',
      options: [
        'Do them in the order asked',
        'Pick the one you think matters',
        'Surface the conflict, state your recommendation on order, and confirm',
        'Ask them to decide and wait',
      ],
      answerIndex: 2,
      rationale: 'Quiet prioritisation with a stated recommendation beats silent obedience or an empty question. Waiting is the only wrong answer.',
    },
    {
      id: 'va-2',
      question: 'What makes an inbox handoff actually work?',
      options: [
        'Every email forwarded as it arrives',
        'Filters, flags and a short daily brief: what needs them, what was handled, what is pending',
        'Archiving aggressively',
        'Replying to everything yourself',
      ],
      answerIndex: 1,
      rationale: 'Triage is the value. A principal who opens their phone to 200 unread has been failed, not served.',
    },
    {
      id: 'va-3',
      question: 'A calendar conflict appears for a meeting that cannot move. You…',
      options: [
        'Let both invites stand',
        'Cancel one at random',
        'Flag it immediately with options, handle logistics, and confirm the outcome in writing',
        'Reschedule something without asking',
      ],
      answerIndex: 2,
      rationale: 'Escalate early with options, then confirm in writing. Silence on a conflict is how executives end up double-booked.',
    },
    {
      id: 'va-4',
      question: 'Confidentiality looks like…',
      options: [
        'Signing the NDA and moving on',
        'Handling credentials through a manager, never reusing devices, and saying no to requests that bypass it',
        'Never discussing work with anyone',
        'Keeping files on a personal laptop',
      ],
      answerIndex: 1,
      rationale: 'Practice, not paperwork: credential hygiene, device separation, and the nerve to decline unsafe requests.',
    },
    {
      id: 'va-5',
      question: 'How do you prove your value as a VA over time?',
      options: [
        'Hours logged',
        'Messages answered and tasks closed without follow-up needed',
        'Always being online',
        'How fast you reply',
      ],
      answerIndex: 1,
      rationale: 'Value is measured in what never reaches the principal again. Hours and speed are inputs; absence of rework is the outcome.',
    },
  ],

  /* Used when no path can be inferred - a general professional screen. */
  'bank-general': [
    {
      id: 'gen-1',
      question: 'Walk me through a decision you made that turned out wrong. What now?',
      options: [
        'Name one, what it cost, and the rule you adopted afterwards',
        'Claim you have never been wrong',
        'Describe a minor preference you changed',
        'Blame missing information entirely',
      ],
      answerIndex: 0,
      rationale: 'Specific cost plus a changed rule is accountability. Denial or vagueness tells an interviewer you do not metabolise failure.',
    },
    {
      id: 'gen-2',
      question: 'A deadline and quality are in direct conflict with two days left. You…',
      options: [
        'Ship anything on time',
        'Miss the deadline silently and polish',
        'Name the trade-off to the stakeholder with options: cut scope, extend, or add help',
        'Ask the team to work nights without asking',
      ],
      answerIndex: 2,
      rationale: 'Trade-offs get escalated with options, never absorbed silently. Both silent choices break trust from one direction or the other.',
    },
    {
      id: 'gen-3',
      question: 'What do you do when you do not know the answer?',
      options: [
        'Guess confidently',
        'Say so, say how you would find out, and follow up with the actual answer',
        'Deflect to someone else',
        'Avoid the question entirely',
      ],
      answerIndex: 1,
      rationale: 'Confident guessing destroys credibility permanently. The find-out-then-follow-up pattern is the professional answer.',
    },
    {
      id: 'gen-4',
      question: 'How do you decide what to work on first each day?',
      options: [
        'Whatever arrives first',
        'The item with the nearest hard deadline',
        'Impact against effort, adjusted for who is waiting on it',
        'Whatever is easiest to clear',
      ],
      answerIndex: 2,
      rationale: 'Impact-per-effort with waiting-parties in the frame. Deadline-first works until everything is urgent to someone.',
    },
    {
      id: 'gen-5',
      question: 'Why here, and not the company down the road?',
      options: [
        'You are hiring and I need a job',
        'Because you are known for this work, and here is the specific thing I want to build with you',
        'I applied everywhere',
        'The office is close to my house',
      ],
      answerIndex: 1,
      rationale: 'Research plus intent. Interviewers are choosing someone who chose them back, not someone routing applications.',
    },
  ],
};

/** How many questions one sitting plays. First to two right/wrong ends it. */
export const QUESTIONS_PER_ATTEMPT = 4;
export const PASS_AT = 2;
export const FAIL_AT = 2;