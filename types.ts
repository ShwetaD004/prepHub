export enum Feature {
  DASHBOARD = 'DASHBOARD',
  APTITUDE_PREP = 'APTITUDE_PREP',
  TECHNICAL_PREP = 'TECHNICAL_PREP',
  HR_PREP = 'HR_PREP',
  GROUP_DISCUSSION = 'GROUP_DISCUSSION',
  PROFILE_REVIEW = 'PROFILE_REVIEW',
  HISTORY = 'HISTORY',
  REVIEW_HUB = 'REVIEW_HUB',
  MOCK_INTERVIEW = 'MOCK_INTERVIEW',
}

export enum AptitudeTopic {
  QUANTITATIVE = 'Quantitative Aptitude',
  LOGICAL_REASONING = 'Logical Reasoning',
  VERBAL_ABILITY = 'Verbal Ability',
  DATA_INTERPRETATION = 'Data Interpretation',
}

export const AptitudeSubTopics: Record<AptitudeTopic, string[]> = {
  [AptitudeTopic.QUANTITATIVE]: [
    'All Topics', 'Number System', 'HCF & LCM', 'Percentage', 'Profit & Loss', 'Ratio & Proportion', 'Time & Work', 'Time, Speed & Distance', 'Boats & Streams', 'Simple & Compound Interest', 'Area & Volume', 'Permutation & Combination', 'Probability'
  ],
  [AptitudeTopic.LOGICAL_REASONING]: [
    'All Topics', 'Analogy', 'Blood Relations', 'Calendars & Clocks', 'Coding-Decoding', 'Direction Sense', 'Number Series', 'Seating Arrangement', 'Syllogism', 'Statement & Conclusion'
  ],
  [AptitudeTopic.VERBAL_ABILITY]: [
    'All Topics', 'Synonyms & Antonyms', 'Idioms & Phrases', 'Error Spotting', 'Sentence Correction', 'Para Jumbles', 'Reading Comprehension', 'Close Test'
  ],
  [AptitudeTopic.DATA_INTERPRETATION]: [
    'All Topics', 'Tables', 'Bar Charts', 'Pie Charts', 'Line Graphs'
  ],
};


export enum TechnicalRole {
  FRONTEND = 'Frontend Developer',
  BACKEND = 'Backend Developer',
  FULLSTACK = 'Full-Stack Developer',
  DATA_SCIENTIST = 'Data Scientist',
  DEVOPS = 'DevOps Engineer'
}

export enum CompanyTier {
    FAANG = 'FAANG / Top Tier',
    STARTUP = 'High-Growth Startup',
    SERVICE = 'Service-Based / Consulting',
    CORE = 'Core Engineering / Manufacturing'
}

export interface AptitudeQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  subTopic: string;
}

export interface AptitudeQuizResult {
  id?: string;
  userId: string;
  score: number;
  total: number;
  correctAnswers: number;
  incorrectAnswers: number;
  topic: string;
  difficulty: string;
  timestamp: any; // Firestore Timestamp
  type: 'Aptitude';
  quizType: 'Practice' | 'Diagnostic';
  questions: AptitudeQuestion[];
  userAnswers: (string | null)[];
  timePerQuestion: number[];
}

export interface GDChatMessage {
  participant: string;
  message: string;
}

export interface TechnicalSession {
  id?: string;
  userId: string;
  role: string;
  experience?: string;
  techStack?: string;
  jobDescription?: string;
  conversation: { question: string; answer: string; feedback: string }[];
  timestamp: any; // Firestore Timestamp
  type: 'Technical';
}

export interface HrSession {
  id?: string;
  userId: string;
  conversation: { question: string; answer: string; feedback?: string }[];
  overallFeedback: string;
  timestamp: any; // Firestore Timestamp
  type: 'HR';
}

export interface GdSession {
  id?: string;
  userId: string;
  topic: string;
  chatLog: GDChatMessage[];
  timestamp: any; // Firestore Timestamp
  type: 'GroupDiscussion';
}

export interface ProfileReview {
    id?: string;
    userId: string;
    resumeText: string;
    linkedinUrl?: string;
    githubUrl?: string;
    targetRole: string;
    targetCompanyTier: string;
    feedback: string;
    timestamp: any; // Firestore Timestamp
    type: 'ProfileReview';
}

export type MockInterviewRoundResult = 
    | { type: 'Aptitude', score: number, total: number, correctAnswers: number, question?: never, answer?: never, feedback?: never }
    | { type: 'Technical' | 'HR', question: string, answer: string, feedback: string, score?: never, total?: never, correctAnswers?: never };

export interface MockInterviewSession {
    id?: string;
    userId: string;
    role: string;
    companyTier: string;
    duration: number; // minutes
    results: MockInterviewRoundResult[];
    overallFeedback: string;
    timestamp: any; // Firestore Timestamp
    type: 'MockInterview';
}

// ---- Personal Progress Types ----
export interface UserGoal {
    id?: string;
    userId: string;
    topic: AptitudeTopic;
    targetAccuracy: number;
    initialAccuracy: number;
    currentAccuracy: number;
    startDate: any; // Firestore Timestamp
    endDate: any; // Firestore Timestamp
    isActive: boolean;
}

export interface UserActivityLog {
    id?: string;
    userId: string;
    date: any; // Firestore Timestamp
}

export interface RevisionQuestion {
    id?: string;
    userId: string;
    question: AptitudeQuestion;
    quizTopic: string;
    timestamp?: any;
}

export interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string;
    tier: 'Bronze' | 'Silver' | 'Gold';
    earned: boolean;
    earnedAt?: any; // Firestore Timestamp
}

export interface UserProfile {
    id?: string;
    userId: string;
    streak: number;
    lastActivityDate: any; // Firestore Timestamp
}

// --- NEW UNIFIED HISTORY SCHEMA ---

interface BaseDataReference {
    questionsAnswered?: number;
    qAndA_list?: { question: string; answer: string; feedback_summary?: string }[];
}

export interface AptitudeDataReference extends BaseDataReference {
    topic: string;
    difficulty: string;
    quizType: 'Practice' | 'Diagnostic';
}

export interface TechnicalDataReference extends BaseDataReference {
    role: string;
    experience?: string;
    techStack?: string[];
    jobDescription?: string;
    fullReport?: string;
}

export interface HrDataReference extends BaseDataReference {
    fullReport?: string;
}

export interface MockDataReference extends BaseDataReference {
    role: string;
    companyTier: string;
    fullReport?: string;
}

export interface GroupDiscussionDataReference {
    topic: string;
    userTurns: number;
    chatLog?: GDChatMessage[];
}

export interface ProfileReviewDataReference {
    targetCompanyTier: string;
    keyRecommendations: string[];
    fullReport?: string;
}

export interface ReviewHubDataReference {
    reviewItemsSaved?: number;
    reviewItemsRemoved?: number;
}

export interface InterviewHistory {
    id?: string;
    userId: string;
    type: 'aptitude' | 'hr' | 'technical' | 'profile_review' | 'group_discussion' | 'mock' | 'review_hub';
    sessionId: string;
    timestamp: any; // Firestore Timestamp
    durationSeconds?: number;
    scoreRating?: string | number;
    summary: string;
    dataReference: AptitudeDataReference | TechnicalDataReference | HrDataReference | MockDataReference | GroupDiscussionDataReference | ProfileReviewDataReference | ReviewHubDataReference;
}