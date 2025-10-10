

import React, { useState, useEffect, useCallback } from 'react';

import { Feature, AptitudeTopic, UserGoal, Badge, UserProfile } from '../types';

import { getActiveGoal, setUserGoal, getRevisionQuestions, getUserProfile, getEarnedBadges, getAllBadgeDefinitions, getAverageAccuracyForTopic } from '../services/firestoreService';
import { parseUserGoal, extractTopicFromGoal } from '../services/geminiService';
import { User } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import Spinner from './shared/Spinner';

interface DashboardProps {
  onSelectFeature: (feature: Feature) => void;
  user: User;
}

const FeatureCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  gradient: string;
}> = ({ title, description, icon, onClick, gradient }) => (
  <div 
    onClick={onClick}
    className={`relative cursor-pointer rounded-2xl p-8 text-white overflow-hidden group transition-all duration-500 hover:scale-105 hover:shadow-2xl ${gradient}`}
  >
    <div className="relative z-10 flex flex-col h-full">
      <div className="mb-4 bg-white/20 p-4 rounded-full self-start text-white">{icon}</div>
      <h3 className="text-2xl font-bold mb-2">{title}</h3>
      <p className="opacity-80 mb-6 flex-grow">{description}</p>
      <div className="mt-auto text-lg font-semibold flex items-center">
        Start Now
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 transform transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
      </div>
    </div>
  </div>
);

const GoalSetter: React.FC<{ user: User, onGoalSet: () => void }> = ({ user, onGoalSet }) => {
    const [goalText, setGoalText] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [loadingMessage, setLoadingMessage] = useState('');

    const handleSave = async () => {
        if (!goalText.trim()) {
            setError('Please enter your goal.');
            return;
        }
        setIsSaving(true);
        setError('');
        try {
            // Step 1: Extract Topic
            setLoadingMessage('Understanding your goal...');
            const topic = await extractTopicFromGoal(goalText);

            // Step 2: Get Current Accuracy
            setLoadingMessage('Checking your performance...');
            const currentAccuracy = await getAverageAccuracyForTopic(user.uid, topic);
            
            // Step 3: Parse Full Goal with context
            setLoadingMessage('Setting a smart target...');
            const parsedGoal = await parseUserGoal(goalText, currentAccuracy);
            
            const { targetAccuracy, days } = parsedGoal;
            
            const startDate = Timestamp.now();
            const endDate = Timestamp.fromMillis(startDate.toMillis() + days * 24 * 60 * 60 * 1000);
            
            const initialAccuracy = currentAccuracy !== null ? currentAccuracy : 0;

            const goal: Omit<UserGoal, 'id'> = {
                userId: user.uid,
                topic: parsedGoal.topic,
                targetAccuracy,
                startDate,
                endDate,
                isActive: true,
                initialAccuracy,
                currentAccuracy: initialAccuracy,
            };

            await setUserGoal(goal);
            onGoalSet();
        } catch (error) {
            console.error("Failed to set goal", error);
            setError("Couldn't understand that goal. Try: 'Improve in Logical Reasoning in 2 weeks'.");
        } finally {
            setIsSaving(false);
            setLoadingMessage('');
        }
    };
    
    return (
        <div className="p-4 space-y-4">
            <div>
                <label className="block text-sm font-bold text-on-secondary mb-1">Describe your goal:</label>
                <textarea
                  value={goalText}
                  onChange={e => setGoalText(e.target.value)}
                  placeholder="e.g., I want to improve my score in Logical Reasoning..."
                  className="w-full p-2 border rounded-md bg-white/70 h-24"
                />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button onClick={handleSave} disabled={isSaving} className="w-full bg-primary text-white font-bold py-2 rounded-lg hover:bg-primary-dark transition disabled:bg-slate-400">
                {isSaving ? (loadingMessage || 'Analyzing...') : 'Set My Goal'}
            </button>
        </div>
    )
};


const AllBadgesModal: React.FC<{ isOpen: boolean, onClose: () => void, earnedBadges: Badge[] }> = ({ isOpen, onClose, earnedBadges }) => {
    if (!isOpen) return null;

    const allBadgeDefs = getAllBadgeDefinitions();
    const earnedBadgeIds = new Set(earnedBadges.map(b => b.id));

    const tiers: ('Gold' | 'Silver' | 'Bronze')[] = ['Gold', 'Silver', 'Bronze'];
    const badgesByTier = tiers.map(tier => ({
        tier,
        badges: allBadgeDefs.filter(b => b.tier === tier)
    }));
    
    const tierBackgrounds = {
        Gold: 'bg-yellow-400/10',
        Silver: 'bg-slate-400/10',
        Bronze: 'bg-amber-600/10',
    };
    
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-surface rounded-2xl shadow-2xl p-8 max-w-2xl w-full mx-4 border border-white/20 animate-slide-in-up" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-bold text-on-surface">Achievements</h2>
                    <button onClick={onClose} className="text-on-secondary hover:text-on-surface" aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto pr-4 -mr-4">
                    {badgesByTier.map(({ tier, badges }) => (
                        <div key={tier} className="mb-6">
                            <h3 className="text-xl font-bold mb-4" style={{color: tier === 'Gold' ? '#FFD700' : tier === 'Silver' ? '#C0C0C0' : '#CD7F32'}}>{tier} Badges</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {badges.map(badge => {
                                    const isEarned = earnedBadgeIds.has(badge.id);
                                    return (
                                        <div key={badge.id} className={`p-4 rounded-lg flex items-center transition-all ${isEarned ? tierBackgrounds[badge.tier] : 'bg-slate-100'}`}>
                                            <div className="mr-4 flex-shrink-0">
                                                <BadgeIcon icon={badge.icon} tier={badge.tier} isEarned={isEarned} />
                                            </div>
                                            <div>
                                                <h4 className={`font-bold ${isEarned ? 'text-on-surface' : 'text-slate-500'}`}>{badge.name}</h4>
                                                <p className={`text-sm ${isEarned ? 'text-on-secondary' : 'text-slate-400'}`}>{badge.description}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};


const Dashboard: React.FC<DashboardProps> = ({ user, onSelectFeature }) => {
  const [activeGoal, setActiveGoal] = useState<UserGoal | null>(null);
  const [streak, setStreak] = useState(0);
  const [revisionCount, setRevisionCount] = useState(0);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showGoalSetter, setShowGoalSetter] = useState(false);
  const [isBadgesModalOpen, setIsBadgesModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    
    const [goal, profile, earnedBadges, revisionQuestions] = await Promise.all([
        getActiveGoal(user.uid),
        getUserProfile(user.uid),
        getEarnedBadges(user.uid),
        getRevisionQuestions(user.uid)
    ]);
    
    setActiveGoal(goal);
    setStreak(profile?.streak || 0);
    setBadges(earnedBadges);
    setRevisionCount(revisionQuestions.length);

    setIsLoading(false);
  }, [user.uid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const features = [
    {
      title: 'Full Mock Interview',
      description: 'Simulate a multi-round interview from start to finish.',
      icon: <IconBriefcase className="h-8 w-8" />,
      feature: Feature.MOCK_INTERVIEW,
      gradient: 'from-blue-500 to-indigo-600',
    },
    {
      title: 'Aptitude Preparation',
      description: 'Sharpen your skills with adaptive practice tests.',
      icon: <IconCalculator className="h-8 w-8" />,
      feature: Feature.APTITUDE_PREP,
      gradient: 'from-secondary to-primary',
    },
    {
      title: 'Technical Interview',
      description: 'Practice with role-specific questions and get AI feedback.',
      icon: <IconCode className="h-8 w-8" />,
      feature: Feature.TECHNICAL_PREP,
      gradient: 'from-accent to-[#d48444]',
    },
    {
      title: 'HR + Panel Interview',
      description: 'Master behavioral questions and communication.',
      icon: <IconUsers className="h-8 w-8" />,
      feature: Feature.HR_PREP,
      gradient: 'from-primary-dark to-primary',
    },
    {
      title: 'Group Discussion',
      description: 'Enhance your debating skills in a simulated GD.',
      icon: <IconChat className="h-8 w-8" />,
      feature: Feature.GROUP_DISCUSSION,
      gradient: 'from-[#815c3c] to-[#a47a54]',
    },
    {
      title: 'Profile & Resume Review',
      description: 'Get an expert AI review to stand out.',
      icon: <IconDocument className="h-8 w-8" />,
      feature: Feature.PROFILE_REVIEW,
      gradient: 'from-secondary to-[#DAD7CD]',
    },
  ];

  return (
    <div className="p-4 md:p-8 animate-fade-in">
        <AllBadgesModal isOpen={isBadgesModalOpen} onClose={() => setIsBadgesModalOpen(false)} earnedBadges={badges} />
      <header className="text-center mb-8">
        <h1 className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
          Welcome to PrepHub
        </h1>
        <p className="text-on-secondary mt-4 text-lg max-w-2xl mx-auto">Your personal AI-powered coach to ace any interview. Select a module to begin.</p>
      </header>
      
      {/* Personal Progress Section */}
      <section className="mb-12">
          <h2 className="text-2xl font-bold text-on-surface mb-4">Personal Progress</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Goal Card */}
              <div className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/30 p-6 flex flex-col">
                  <h3 className="font-bold text-on-surface text-lg mb-2 flex items-center"><IconTarget className="h-6 w-6 text-on-surface" /> <span className="ml-2">My Goal</span></h3>
                  {isLoading ? <div className="flex-grow flex items-center justify-center"><Spinner size="sm" /></div> :
                   activeGoal ? (
                       <div className="flex-grow flex flex-col">
                           <p className="text-on-secondary text-sm mb-3">Improve <span className="font-bold">{activeGoal.topic}</span> accuracy to <span className="font-bold">{activeGoal.targetAccuracy}%</span>.</p>
                           <div className="w-full bg-slate-200 rounded-full h-4 relative">
                               <div className="bg-gradient-to-r from-secondary to-primary h-4 rounded-full" style={{ width: `${(activeGoal.currentAccuracy / activeGoal.targetAccuracy) * 100}%` }}></div>
                               <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white mix-blend-screen">{activeGoal.currentAccuracy.toFixed(0)}%</span>
                           </div>
                           <div className="flex justify-between text-xs font-semibold text-on-secondary mt-1">
                               <span>Start: {activeGoal.initialAccuracy.toFixed(0)}%</span>
                               <span>Target: {activeGoal.targetAccuracy}%</span>
                           </div>
                           <button onClick={() => onSelectFeature(Feature.APTITUDE_PREP)} className="mt-auto bg-primary/10 text-primary font-bold py-2 px-4 rounded-lg w-full text-sm hover:bg-primary/20 transition">Practice Now</button>
                       </div>
                   ) : showGoalSetter ? (
                       <GoalSetter user={user} onGoalSet={() => { setShowGoalSetter(false); fetchData(); }} />
                   ) : (
                       <div className="text-center flex-grow flex flex-col items-center justify-center">
                           <p className="text-on-secondary mb-4">Set a goal to track your progress!</p>
                           <button onClick={() => setShowGoalSetter(true)} className="bg-primary text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-dark transition">Set a New Goal</button>
                       </div>
                   )}
              </div>
              
              {/* Streak Card */}
              <div className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/30 p-6 flex flex-col items-center justify-center text-center">
                  <h3 className="font-bold text-on-surface text-lg mb-2 flex items-center"><IconFlame className="h-6 w-6 text-on-surface" /> <span className="ml-2">Practice Streak</span></h3>
                  {isLoading ? <Spinner size="sm" /> : (
                      <>
                          <p className="text-6xl font-extrabold text-accent">{streak}</p>
                          <p className="text-on-secondary font-semibold">{streak === 1 ? 'Day' : 'Days'} in a row!</p>
                      </>
                  )}
              </div>
              
              {/* Review Hub Card */}
              <div className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/30 p-6 flex flex-col items-center justify-center text-center">
                  <h3 className="font-bold text-on-surface text-lg mb-2 flex items-center"><IconBookmark className="h-6 w-6" /> <span className="ml-2">Review Hub</span></h3>
                  {isLoading ? <Spinner size="sm" /> : (
                      <>
                          <p className="text-6xl font-extrabold text-primary-dark">{revisionCount}</p>
                          <p className="text-on-secondary font-semibold mb-4">Questions to review</p>
                          <button onClick={() => onSelectFeature(Feature.REVIEW_HUB)} className="bg-primary/10 text-primary font-bold py-2 px-6 rounded-lg text-sm hover:bg-primary/20 transition w-full">Review Now</button>
                      </>
                  )}
              </div>

              {/* Badges Card */}
              <div className="bg-white/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/30 p-6 flex flex-col">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-on-surface text-lg flex items-center"><IconBadge className="h-6 w-6 text-on-surface" /> <span className="ml-2">My Badges</span></h3>
                    <button onClick={() => setIsBadgesModalOpen(true)} className="text-sm font-semibold text-primary hover:underline">View All</button>
                  </div>
                  {isLoading ? <div className="flex-grow flex items-center justify-center"><Spinner size="sm"/></div> : badges.length > 0 ? (
                      <div className="grid grid-cols-3 gap-y-2 text-center flex-grow content-center">
                          {badges.slice(0, 6).map(badge => (
                              <div key={badge.id} className="flex flex-col items-center p-1" title={`${badge.name}: ${badge.description}`}>
                                  <BadgeIcon icon={badge.icon} tier={badge.tier} isEarned={true} />
                                  <p className="text-xs text-on-secondary truncate w-full mt-1.5">{badge.name}</p>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <div className="text-center flex-grow flex flex-col items-center justify-center">
                          <p className="text-on-secondary">Start practicing to earn badges!</p>
                      </div>
                  )}
              </div>
          </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {features.map((item) => (
          <FeatureCard
            key={item.feature}
            title={item.title}
            description={item.description}
            icon={item.icon}
            onClick={() => onSelectFeature(item.feature)}
            gradient={`bg-gradient-to-br ${item.gradient}`}
          />
        ))}
      </div>
    </div>
  );
};

// SVG Icons
const IconCalculator: React.FC<{ className?: string }> = ({ className = "h-8 w-8" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16M12 4v16"/></svg>
);
const IconCode: React.FC<{ className?: string }> = ({ className = "h-8 w-8" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
);
const IconUsers: React.FC<{ className?: string }> = ({ className = "h-8 w-8" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197" /></svg>
);
const IconChat: React.FC<{ className?: string }> = ({ className = "h-8 w-8" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V4a2 2 0 012-2h6.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V8z" /></svg>
);
const IconDocument: React.FC<{className?: string}> = ({ className = "h-8 w-8" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
);
const IconBriefcase: React.FC<{className?: string}> = ({ className = "h-8 w-8" }) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
const IconTarget: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9 9 0 100-18 9 9 0 000 18z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15a3 3 0 100-6 3 3 0 000 6z" /></svg>;
const IconFlame: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.657 7.343A8 8 0 0117.657 18.657z" /></svg>;
const IconBadge: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>;
const IconBookmark: React.FC<{ className?: string }> = ({ className = "h-8 w-8" }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>;
const IconChart: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" /></svg>;
const IconBrain: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.871 4A17.926 17.926 0 0112 2c4.093 0 7.822 1.68 10.435 4.435M5.565 19.565A17.926 17.926 0 0112 22a17.926 17.926 0 01-6.435-2.435M12 22V15a3 3 0 00-3-3H6.707a1 1 0 01-.707-1.707l3.536-3.536a1 1 0 011.414 0l3.536 3.536A1 1 0 0117.293 12H15a3 3 0 00-3 3v7z" /></svg>;
const IconBook: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
const IconGlobe: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2h10a2 2 0 002-2v-1a2 2 0 012-2h1.945M7.707 4.5h8.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V11a2 2 0 01-2 2H7a2 2 0 01-2-2V7.914a1 1 0 01.293-.707l2.414-2.414A1 1 0 017.707 4.5z" /></svg>;
const IconCalendar: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;

const BadgeIcon: React.FC<{ icon: string, tier: 'Bronze' | 'Silver' | 'Gold', isEarned: boolean }> = ({ icon, tier, isEarned }) => {
    const tierGradients = {
        Gold: 'bg-gradient-to-br from-yellow-400 to-amber-500 shadow-yellow-500/30',
        Silver: 'bg-gradient-to-br from-slate-300 to-slate-500 shadow-slate-500/30',
        Bronze: 'bg-gradient-to-br from-amber-600 to-yellow-800 shadow-amber-800/30',
    };
    const stoneGradient = 'bg-gradient-to-br from-slate-500 to-slate-700 shadow-slate-700/30';
    const iconSize = "w-6 h-6";

    const IconComponent = {
        Flame: (props: {className?: string}) => <IconFlame {...props} />,
        Calculator: (props: {className?: string}) => <IconCalculator {...props} />,
        Target: (props: {className?: string}) => <IconTarget {...props} />,
        Chart: (props: {className?: string}) => <IconChart {...props} />,
        Brain: (props: {className?: string}) => <IconBrain {...props} />,
        Book: (props: {className?: string}) => <IconBook {...props} />,
        Code: (props: {className?: string}) => <IconCode {...props} />,
        Users: (props: {className?: string}) => <IconUsers {...props} />,
        Chat: (props: {className?: string}) => <IconChat {...props} />,
        Globe: (props: {className?: string}) => <IconGlobe {...props} />,
        Calendar: (props: {className?: string}) => <IconCalendar {...props} />,
        Briefcase: (props: {className?: string}) => <IconBriefcase {...props} />,
        Document: (props: {className?: string}) => <IconDocument {...props} />,
        Bookmark: (props: {className?: string}) => <IconBookmark {...props} />,
    }[icon] || ((props: {className?: string}) => <IconBadge {...props} />);

    if (!isEarned) {
        return (
            <div className={`w-10 h-10 flex items-center justify-center rounded-full shadow-md ${stoneGradient}`}>
                <IconComponent className={`${iconSize} text-slate-400`} />
            </div>
        );
    }
    
    return (
        <div className={`w-10 h-10 flex items-center justify-center rounded-full shadow-lg ${tierGradients[tier]}`}>
            <IconComponent className={`${iconSize} text-white/90`} />
        </div>
    );
};

export default Dashboard;