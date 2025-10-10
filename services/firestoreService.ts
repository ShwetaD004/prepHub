import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, Timestamp, orderBy, limit, writeBatch, doc, setDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { AptitudeQuizResult, UserGoal, RevisionQuestion, Badge, UserProfile, AptitudeTopic, InterviewHistory } from '../types';

// --- Helper to prevent circular JSON errors ---
// Recursively converts Firestore Timestamps to JS Date objects in any fetched data.
const convertTimestamps = (data: any): any => {
    if (data instanceof Timestamp) {
        return data.toDate();
    }
    if (Array.isArray(data)) {
        return data.map(convertTimestamps);
    }
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
        return Object.keys(data).reduce((acc, key) => {
            acc[key] = convertTimestamps(data[key]);
            return acc;
        }, {} as { [key: string]: any });
    }
    return data;
};


// --- Badge Logic (Centralized) ---
const allBadges: Omit<Badge, 'earned' | 'earnedAt'>[] = [
  // Streak & Consistency
  { id: 'streak-7', name: 'Consistent Learner', description: 'Maintain a 7-day practice streak.', icon: 'Flame', tier: 'Bronze' },
  { id: 'streak-30', name: 'Dedicated Scholar', description: 'Maintain a 30-day practice streak.', icon: 'Flame', tier: 'Silver' },
  { id: 'weekend-warrior', name: 'Weekend Warrior', description: 'Complete a practice session on a weekend.', icon: 'Calendar', tier: 'Bronze' },
  
  // Aptitude General
  { id: 'apti-10', name: 'Aptitude Explorer', description: 'Complete 10 aptitude quizzes.', icon: 'Calculator', tier: 'Bronze' },
  { id: 'apti-50', name: 'Aptitude Veteran', description: 'Complete 50 aptitude quizzes.', icon: 'Calculator', tier: 'Silver' },
  { id: 'apti-perfect', name: 'Perfectionist', description: 'Score 100% on an aptitude quiz with at least 10 questions.', icon: 'Target', tier: 'Gold' },
  
  // Aptitude Specific
  { id: 'quant-master', name: 'Quant Master', description: 'Score >90% in a Quantitative Aptitude quiz.', icon: 'Chart', tier: 'Silver' },
  { id: 'logical-master', name: 'Logic Wizard', description: 'Score >90% in a Logical Reasoning quiz.', icon: 'Brain', tier: 'Silver' },
  { id: 'verbal-master', name: 'Verbal Virtuoso', description: 'Score >90% in a Verbal Ability quiz.', icon: 'Book', tier: 'Silver' },
  { id: 'di-detective', name: 'Data Detective', description: 'Score over 90% in a Data Interpretation quiz.', icon: 'Chart', tier: 'Silver' },

  // Diagnostic
  { id: 'diagnostic-complete', name: 'Self-Aware', description: 'Complete your first diagnostic test.', icon: 'Target', tier: 'Bronze' },
  { id: 'diagnostic-high-potential', name: 'High Potential', description: 'Score over 75% on a diagnostic test.', icon: 'Target', tier: 'Silver' },

  // Module Completion
  { id: 'tech-5', name: 'Techie', description: 'Complete 5 technical interview sessions.', icon: 'Code', tier: 'Bronze' },
  { id: 'hr-5', name: 'Communicator', description: 'Complete 5 HR interview sessions.', icon: 'Users', tier: 'Bronze' },
  { id: 'gd-5', name: 'Debater', description: 'Participate in 5 group discussions.', icon: 'Chat', tier: 'Bronze' },
  { id: 'mock-star', name: 'Mock Star', description: 'Complete 3 full mock interviews.', icon: 'Briefcase', tier: 'Silver' },

  // Feature Engagement
  { id: 'profile-auditor', name: 'Auditor', description: 'Get your profile reviewed for the first time.', icon: 'Document', tier: 'Bronze' },
  { id: 'revisionist', name: 'Revisionist', description: 'Add 10 or more questions to your Review Hub.', icon: 'Bookmark', tier: 'Bronze' },
  { id: 'well-rounded', name: 'Well-Rounded', description: 'Try every prep module at least once.', icon: 'Globe', tier: 'Gold' },
];

export const getAllBadgeDefinitions = (): Omit<Badge, 'earned' | 'earnedAt'>[] => {
    return allBadges;
};

const checkAllBadges = (history: InterviewHistory[], streak: number, revisionCount: number): string[] => {
    const aptitudeHistory = history.filter(item => item.type === 'aptitude');
    const diagnosticTests = aptitudeHistory.filter(h => (h.dataReference as any).quizType === 'Diagnostic');
    
    const earnedBadgeIds = new Set<string>();

    // Streak
    if (streak >= 7) earnedBadgeIds.add('streak-7');
    if (streak >= 30) earnedBadgeIds.add('streak-30');
    const today = new Date().getDay(); // 0 for Sunday, 6 for Saturday
    if (history.length > 0 && (today === 0 || today === 6)) {
        const lastActivityDate = (history[0].timestamp as Date); // Timestamps are converted
        if(lastActivityDate && lastActivityDate.toDateString() === new Date().toDateString()){
             earnedBadgeIds.add('weekend-warrior');
        }
    }
    
    // Aptitude General
    if (aptitudeHistory.length >= 10) earnedBadgeIds.add('apti-10');
    if (aptitudeHistory.length >= 50) earnedBadgeIds.add('apti-50');
    if (aptitudeHistory.some(h => typeof h.scoreRating === 'number' && h.scoreRating === 100 && (h.dataReference as any).questionsAnswered >= 10)) earnedBadgeIds.add('apti-perfect');

    // Aptitude Specific Topics
    if (aptitudeHistory.some(h => (h.dataReference as any).topic === AptitudeTopic.QUANTITATIVE && typeof h.scoreRating === 'number' && h.scoreRating > 90)) earnedBadgeIds.add('quant-master');
    if (aptitudeHistory.some(h => (h.dataReference as any).topic === AptitudeTopic.LOGICAL_REASONING && typeof h.scoreRating === 'number' && h.scoreRating > 90)) earnedBadgeIds.add('logical-master');
    if (aptitudeHistory.some(h => (h.dataReference as any).topic === AptitudeTopic.VERBAL_ABILITY && typeof h.scoreRating === 'number' && h.scoreRating > 90)) earnedBadgeIds.add('verbal-master');
    if (aptitudeHistory.some(h => (h.dataReference as any).topic === AptitudeTopic.DATA_INTERPRETATION && typeof h.scoreRating === 'number' && h.scoreRating > 90)) earnedBadgeIds.add('di-detective');

    // Diagnostic
    if (diagnosticTests.length > 0) earnedBadgeIds.add('diagnostic-complete');
    if (diagnosticTests.some(h => typeof h.scoreRating === 'number' && h.scoreRating > 75)) earnedBadgeIds.add('diagnostic-high-potential');

    // Module Completion
    if (history.filter(item => item.type === 'technical').length >= 5) earnedBadgeIds.add('tech-5');
    if (history.filter(item => item.type === 'hr').length >= 5) earnedBadgeIds.add('hr-5');
    if (history.filter(item => item.type === 'group_discussion').length >= 5) earnedBadgeIds.add('gd-5');
    if (history.filter(item => item.type === 'mock').length >= 3) earnedBadgeIds.add('mock-star');

    // Feature Engagement
    if (history.some(item => item.type === 'profile_review')) earnedBadgeIds.add('profile-auditor');
    if (revisionCount >= 10) earnedBadgeIds.add('revisionist');
    const allModuleTypes = new Set(history.map(item => item.type));
    if (['aptitude', 'technical', 'hr', 'group_discussion', 'profile_review'].every(type => allModuleTypes.has(type as any))) {
        earnedBadgeIds.add('well-rounded');
    }

    return Array.from(earnedBadgeIds);
};

// --- User Profile & Streak ---
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const profileData = { id: docSnap.id, ...docSnap.data() };
        return convertTimestamps(profileData) as UserProfile;
    }
    return null;
}

const updateUserStreakAndBadges = async (userId: string) => {
    const profileRef = doc(db, 'users', userId);
    const profileSnap = await getDoc(profileRef);
    let profileData = profileSnap.exists() ? profileSnap.data() : { userId, streak: 0, lastActivityDate: null };
    let profile = convertTimestamps(profileData) as UserProfile;

    if (!profileSnap.exists()) {
         await setDoc(profileRef, { userId }); // Create profile if it doesn't exist
    }
    
    // Update Streak
    const today = new Date();
    const lastActivity = profile.lastActivityDate || new Date(0);
    const isSameDay = today.toDateString() === lastActivity.toDateString();
    
    if (!isSameDay) {
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        if (lastActivity.toDateString() === yesterday.toDateString()) {
            profile.streak = (profile.streak || 0) + 1; // Increment streak
        } else {
            profile.streak = 1; // Reset streak
        }
        profile.lastActivityDate = today;
        await setDoc(profileRef, { streak: profile.streak, lastActivityDate: serverTimestamp() }, { merge: true });
    }

    // Update Badges
    const allHistory = await getInterviewHistory(userId);
    const revisionQuestions = await getRevisionQuestions(userId);
    const newBadgeIds = checkAllBadges(allHistory, profile.streak, revisionQuestions.length);

    const batch = writeBatch(db);
    newBadgeIds.forEach(badgeId => {
        const badgeDef = allBadges.find(b => b.id === badgeId);
        if (badgeDef) {
            const badgeRef = doc(db, `users/${userId}/badges`, badgeId);
            batch.set(badgeRef, { ...badgeDef, earned: true, earnedAt: serverTimestamp() });
        }
    });
    await batch.commit();
}

// --- NEW UNIFIED HISTORY FUNCTIONS ---

export const saveInterviewHistory = async (userId: string, historyData: Omit<InterviewHistory, 'id' | 'timestamp' | 'userId'>) => {
    const docData = {
        ...historyData,
        userId,
        timestamp: serverTimestamp(),
    };
    const historyCollectionRef = collection(db, 'users', userId, 'interview_history');
    await addDoc(historyCollectionRef, docData);
    await updateUserStreakAndBadges(userId);
};

export const getInterviewHistory = async (userId: string): Promise<InterviewHistory[]> => {
    const historyCollectionRef = collection(db, 'users', userId, 'interview_history');
    const q = query(historyCollectionRef, orderBy('timestamp', 'desc'), limit(100));
    const snapshot = await getDocs(q);
    const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return convertTimestamps(history) as InterviewHistory[];
};


// --- Aptitude Specific ---
export const hasUserCompletedDiagnostic = async (userId: string): Promise<boolean> => {
    const historyCollectionRef = collection(db, 'users', userId, 'interview_history');
    const q = query(
        historyCollectionRef,
        where('type', '==', 'aptitude'),
        where('dataReference.quizType', '==', 'Diagnostic'),
        limit(1)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
};

export const getAverageAccuracyForTopic = async (userId: string, topic: AptitudeTopic): Promise<number | null> => {
    const historyCollectionRef = collection(db, 'users', userId, 'interview_history');
    const q = query(
        historyCollectionRef,
        where('type', '==', 'aptitude'),
        where('dataReference.topic', '==', topic),
        orderBy('timestamp', 'desc'),
        limit(5)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        return null;
    }
    const scores = snapshot.docs.map(doc => (doc.data() as InterviewHistory).scoreRating as number);
    return scores.reduce((acc, score) => acc + score, 0) / scores.length;
};


// --- Personal Progress Data ---
export const getActiveGoal = async (userId: string): Promise<UserGoal | null> => {
    const q = query(collection(db, 'userGoals'), where('userId', '==', userId), where('isActive', '==', true), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        return null;
    }
    const goalData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    const goal = convertTimestamps(goalData) as UserGoal;

    // Refresh current accuracy before returning
    const currentAccuracy = await getAverageAccuracyForTopic(userId, goal.topic);
    if (currentAccuracy !== null && currentAccuracy !== goal.currentAccuracy) {
        goal.currentAccuracy = currentAccuracy;
        await setDoc(doc(db, 'userGoals', goal.id!), { currentAccuracy }, { merge: true });
    }
    return goal;
};

export const setUserGoal = async (goal: Omit<UserGoal, 'id'>) => {
    // Deactivate any existing active goals for this user
    const q = query(collection(db, 'userGoals'), where('userId', '==', goal.userId), where('isActive', '==', true));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach(d => {
        batch.update(d.ref, { isActive: false });
    });
    
    // Add new goal
    const newGoalRef = doc(collection(db, 'userGoals'));
    batch.set(newGoalRef, goal);

    await batch.commit();
};

// --- Review Hub ---
export const getRevisionQuestions = async (userId: string): Promise<RevisionQuestion[]> => {
    const revisionCollectionRef = collection(db, 'users', userId, 'revisionQuestions');
    const q = query(revisionCollectionRef, where('userId', '==', userId), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    const questions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return convertTimestamps(questions) as RevisionQuestion[];
};

export const tagQuestionForRevision = async (question: Omit<RevisionQuestion, 'id' | 'timestamp'>): Promise<RevisionQuestion> => {
    const docData = {
        ...question,
        timestamp: serverTimestamp(),
    };
    const revisionCollectionRef = collection(db, 'users', question.userId, 'revisionQuestions');
    const docRef = await addDoc(revisionCollectionRef, docData);
    await updateUserStreakAndBadges(question.userId);
    
    const newRevisionQuestion: RevisionQuestion = { 
        ...question,
        id: docRef.id, 
        timestamp: new Date() // Use a plain JS Date object for the immediate state update.
    };
    return newRevisionQuestion;
};

export const untagQuestionForRevision = async (userId: string, id: string): Promise<void> => {
    const revisionDocRef = doc(db, 'users', userId, 'revisionQuestions', id);
    await deleteDoc(revisionDocRef);
};

// --- Badges ---
export const getEarnedBadges = async (userId: string): Promise<Badge[]> => {
    const badgesCollectionRef = collection(db, 'users', userId, 'badges');
    const q = query(badgesCollectionRef, orderBy('earnedAt', 'desc'));
    const snapshot = await getDocs(q);
    const badges = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return convertTimestamps(badges) as Badge[];
};