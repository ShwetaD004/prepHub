import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { reviewProfile } from '../services/geminiService';
import { saveInterviewHistory } from '../services/firestoreService';
import { TechnicalRole, CompanyTier, Feature, InterviewHistory, ProfileReviewDataReference } from '../types';
import Card from './shared/Card';
import Spinner from './shared/Spinner';

// A simple markdown parser
const SimpleMarkdown: React.FC<{ text: string }> = ({ text }) => {
    const formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/```([\s\S]*?)```/g, '<pre class="bg-slate-800 text-white p-4 rounded-md my-4"><code>$1</code></pre>')
        .replace(/`(.*?)`/g, '<code class="bg-slate-200 text-accent px-1 rounded">$1</code>')
        .replace(/^(###\s.*)/gm, (match) => `<h3 class="text-xl font-bold mt-6 mb-2">${match.substring(4)}</h3>`)
        .replace(/^(##\s.*)/gm, (match) => `<h2 class="text-2xl font-bold mt-8 mb-3 border-b pb-2">${match.substring(3)}</h2>`)
        .replace(/^(#\s.*)/gm, (match) => `<h1 class="text-3xl font-bold mt-10 mb-4 border-b pb-3">${match.substring(2)}</h1>`)
        .replace(/\n/g, '<br />');

    return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: formattedText }} />;
};

interface ProfileReviewProps {
    user: User;
    onNavigate: (feature: Feature) => void;
}

const ProfileReview: React.FC<ProfileReviewProps> = ({ user, onNavigate }) => {
    const [targetRole, setTargetRole] = useState<string>(TechnicalRole.FULLSTACK);
    const [targetCompanyTier, setTargetCompanyTier] = useState<string>('');
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [githubUrl, setGithubUrl] = useState('');
    const [resumeText, setResumeText] = useState('');
    
    const [feedback, setFeedback] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleReview = async () => {
        if (!resumeText.trim() || !targetRole || !user) {
            setError('Please fill out your target role and resume text before getting a review.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setFeedback('');
        try {
            const { rating, summary, keyRecommendations, feedback } = await reviewProfile({
                resumeText,
                linkedinUrl,
                githubUrl,
                targetRole,
                targetCompanyTier,
            });
            setFeedback(feedback);
            
            const historyData: Omit<InterviewHistory, 'id'|'userId'|'timestamp'> = {
                type: 'profile_review',
                sessionId: new Date().toISOString(),
                scoreRating: rating,
                summary: summary,
                dataReference: {
                    targetCompanyTier: targetCompanyTier,
                    keyRecommendations: keyRecommendations,
                    fullReport: feedback
                } as ProfileReviewDataReference
            };
            await saveInterviewHistory(user.uid, historyData);

        } catch (err) {
            setError('Failed to get feedback. Please check your API key.');
        }
        setIsLoading(false);
    };
    
    const resetForm = () => {
        setFeedback('');
        setError(null);
        setResumeText('');
        setLinkedinUrl('');
        setGithubUrl('');
    }

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in">
            <Card>
                <h2 className="text-3xl font-bold text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Comprehensive Profile Audit</h2>
                <p className="text-on-secondary text-center mb-8">Provide your career goals and professional links for a complete AI-powered brand analysis.</p>
                
                {!feedback ? (
                <>
                <div className="space-y-6">
                    {/* Step 1: Career Goals */}
                    <div>
                        <label className="block text-lg font-semibold text-on-surface mb-2">1. Define Your Goal</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-on-secondary mb-1">Target Role</label>
                                <select value={targetRole} onChange={e => setTargetRole(e.target.value)} className="w-full p-3 border rounded-md bg-white/70">
                                    {Object.values(TechnicalRole).map(r => <option key={r} value={r}>{r}</option>)}
                                    <option value="Data Analyst">Data Analyst</option>
                                    <option value="Mechanical Engineer">Mechanical Engineer</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-on-secondary mb-1">Target Company Tier (Optional)</label>
                                <select value={targetCompanyTier} onChange={e => setTargetCompanyTier(e.target.value)} className="w-full p-3 border rounded-md bg-white/70">
                                    <option value="">General / Any Tier</option>
                                    {Object.values(CompanyTier).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    {/* Step 2: Professional Profiles */}
                    <div>
                        <label className="block text-lg font-semibold text-on-surface mb-2">2. Add Your Profiles (Optional but Recommended)</label>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-on-secondary mb-1">LinkedIn Profile URL</label>
                                <input type="url" placeholder="https://linkedin.com/in/your-profile" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} className="w-full p-3 border rounded-md bg-white/70" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-on-secondary mb-1">GitHub Profile URL</label>
                                <input type="url" placeholder="https://github.com/your-username" value={githubUrl} onChange={e => setGithubUrl(e.target.value)} className="w-full p-3 border rounded-md bg-white/70" />
                            </div>
                        </div>
                    </div>

                    {/* Step 3: Resume Text */}
                    <div>
                        <label className="block text-lg font-semibold text-on-surface mb-2">3. Paste Your Resume/CV Text</label>
                        <textarea
                            value={resumeText}
                            onChange={(e) => setResumeText(e.target.value)}
                            placeholder="Paste the full text from your resume here..."
                            className="w-full h-60 p-4 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition bg-white/50"
                        />
                    </div>
                </div>


                <div className="mt-8 text-center">
                    <button onClick={handleReview} disabled={isLoading}
                        className="bg-gradient-to-r from-primary to-secondary text-white font-bold py-3 px-12 rounded-lg hover:shadow-xl transform hover:scale-105 transition disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none disabled:scale-100">
                        {isLoading ? 'Analyzing...' : 'Get Comprehensive Review'}
                    </button>
                </div>
                </>
                ) : null}

                {error && <p className="text-red-500 my-4 text-center">{error}</p>}
                
                {isLoading && <div className="mt-8 text-center"><Spinner /><p className="mt-4 text-on-secondary">Your expert audit is being generated...</p></div>}
                
                {feedback && (
                    <div className="mt-8 pt-6 border-t animate-fade-in">
                        <h3 className="text-2xl font-bold text-on-surface mb-4">AI Feedback</h3>
                        <div className="bg-slate-50/50 p-6 rounded-lg text-on-surface">
                           <SimpleMarkdown text={feedback} />
                        </div>
                        <div className="mt-8 text-center space-x-4">
                            <button onClick={() => onNavigate(Feature.DASHBOARD)} className="bg-on-surface text-white font-bold py-3 px-8 rounded-lg hover:bg-on-surface/80 transition-all">Back to Dashboard</button>
                            <button onClick={resetForm} className="bg-gradient-to-r from-primary to-secondary text-white font-bold py-3 px-8 rounded-lg hover:shadow-lg transform hover:scale-105 transition-all">Start New Review</button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default ProfileReview;