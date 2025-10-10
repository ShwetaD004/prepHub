import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import { TechnicalRole, CompanyTier, AptitudeQuestion, MockInterviewRoundResult, Feature, InterviewHistory, MockDataReference } from '../types';
import { 
    generateAptitudeQuestions,
    generateMultipleTechnicalQuestions,
    generateMultipleHrQuestions,
    getTechnicalInterviewFeedback,
    getHrInterviewFeedback,
    getMockInterviewOverallFeedback
} from '../services/geminiService';
import { saveInterviewHistory } from '../services/firestoreService';
import Card from './shared/Card';
import Spinner from './shared/Spinner';
import ConfirmationModal from './shared/ConfirmationModal';

const SimpleMarkdown: React.FC<{ text: string }> = ({ text }) => {
    if (!text) return null;
    const formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/```([\s\S]*?)```/g, '<pre class="bg-slate-800 text-white p-4 rounded-md my-4 overflow-x-auto"><code>$1</code></pre>')
        .replace(/`(.*?)`/g, '<code class="bg-slate-200 text-primary-dark px-1.5 py-0.5 rounded-md">$1</code>')
        .replace(/^(###\s.*)/gm, (match) => `<h3 class="text-xl font-bold mt-6 mb-2">${match.substring(4)}</h3>`)
        .replace(/^(##\s.*)/gm, (match) => `<h2 class="text-2xl font-bold mt-8 mb-3 border-b pb-2">${match.substring(3)}</h2>`)
        .replace(/^(#\s.*)/gm, (match) => `<h1 class="text-3xl font-bold mt-10 mb-4 border-b pb-3">${match.substring(2)}</h1>`)
        .replace(/\n/g, '<br />');

    return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: formattedText }} />;
};

const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

interface MockInterviewProps {
    setIsQuizActive: (isActive: boolean) => void;
    user: User;
    onNavigate: (feature: Feature) => void;
}

const INTERVIEW_STRUCTURE: ('Aptitude' | 'Technical' | 'HR')[] = ['Aptitude', 'Technical', 'HR'];
const ROUND_QUESTION_COUNT = {
    'Aptitude': 30,
    'Technical': 6,
    'HR': 6
};

// --- Icons ---
const IconHome = () => <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
const IconCalculator = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
const IconCode = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>;
const IconUsers = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197" /></svg>;

const MockInterview: React.FC<MockInterviewProps> = ({ setIsQuizActive, user, onNavigate }) => {
    const [flow, setFlow] = useState<'setup' | 'active' | 'results'>('setup');
    const sessionStartTimeRef = useRef<number | null>(null);
    const backgroundFetchPromise = useRef<Promise<void> | null>(null);
    
    // Setup State
    const [targetRole, setTargetRole] = useState<string>(TechnicalRole.FULLSTACK);
    const [targetCompanyTier, setTargetCompanyTier] = useState<string>(CompanyTier.STARTUP);
    const [duration, setDuration] = useState(60); // in minutes

    // Active Interview State
    const [timeLeft, setTimeLeft] = useState(0);
    const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
    const [roundResults, setRoundResults] = useState<MockInterviewRoundResult[]>([]);
    
    // Round-specific state
    const [aptitudeQuestions, setAptitudeQuestions] = useState<AptitudeQuestion[]>([]);
    const [aptitudeAnswers, setAptitudeAnswers] = useState<(string | null)[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

    const [technicalQuestions, setTechnicalQuestions] = useState<string[]>([]);
    const [technicalAnswers, setTechnicalAnswers] = useState<string[]>([]);

    const [hrQuestions, setHrQuestions] = useState<string[]>([]);
    const [hrAnswers, setHrAnswers] = useState<string[]>([]);

    // General State
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [finalResults, setFinalResults] = useState<MockInterviewRoundResult[]>([]);
    const [overallFeedback, setOverallFeedback] = useState('');
    const [isStopModalOpen, setIsStopModalOpen] = useState(false);

    useEffect(() => {
        setIsQuizActive(flow === 'active');
    }, [flow, setIsQuizActive]);
    
    const finishInterview = useCallback(async (currentResults: MockInterviewRoundResult[]) => {
        setIsLoading(true);
        setLoadingMessage('Analyzing your performance and generating the final report...');
        setFlow('results');
        
        setFinalResults(currentResults);

        try {
            const { recommendation, summary, report } = await getMockInterviewOverallFeedback(currentResults, targetRole, targetCompanyTier);
            setOverallFeedback(report);

            const durationSeconds = sessionStartTimeRef.current ? (Date.now() - sessionStartTimeRef.current) / 1000 : duration * 60;
            
            const historyData: Omit<InterviewHistory, 'id'|'userId'|'timestamp'> = {
                type: 'mock',
                sessionId: sessionStartTimeRef.current?.toString() || new Date().toISOString(),
                durationSeconds: durationSeconds,
                scoreRating: recommendation,
                summary: summary,
                dataReference: {
                    role: targetRole,
                    companyTier: targetCompanyTier,
                    questionsAnswered: currentResults.length,
                    qAndA_list: currentResults.filter(r => r.type !== 'Aptitude').map(r => {
                        const feedbackSummary = r.feedback || 'No feedback available.';
                        return {
                            question: r.question!,
                            answer: r.answer!,
                            feedback_summary: feedbackSummary.length > 150 ? feedbackSummary.substring(0, 150) + '...' : feedbackSummary
                        };
                    }),
                    fullReport: report
                } as MockDataReference
            };
            await saveInterviewHistory(user.uid, historyData);

        } catch(err) {
            console.error(err);
            setOverallFeedback("Could not generate overall feedback due to an error.");
        }

        setIsLoading(false);
    }, [user.uid, targetRole, targetCompanyTier, duration]);


    const proceedToNext = async () => {
        const currentRoundType = INTERVIEW_STRUCTURE[currentRoundIndex];
        const isLastQuestionInRound = currentQuestionIndex === ROUND_QUESTION_COUNT[currentRoundType] - 1;

        if (isLastQuestionInRound) {
            setIsLoading(true);
            setLoadingMessage(`Analyzing ${currentRoundType} round...`);
            let newRoundResults: MockInterviewRoundResult[] = [];

            try {
                if (currentRoundType === 'Aptitude') {
                    let correct = 0;
                    aptitudeQuestions.forEach((q, i) => { if(q.correctAnswer === aptitudeAnswers[i]) correct++; });
                    newRoundResults.push({ type: 'Aptitude', score: (correct / aptitudeQuestions.length) * 100, total: aptitudeQuestions.length, correctAnswers: correct });
                } else if (currentRoundType === 'Technical') {
                    // FIX: Changed techStack from a string to an empty array to match InterviewConfig type.
                    const techConfig = { role: targetRole, experience: 'Intern/Fresher', techStack: [], jobDescription: '' };
                    const conversation = technicalQuestions.map((q, i) => ({ question: q, answer: technicalAnswers[i] }));
                    const feedbacks = await getTechnicalInterviewFeedback(conversation, techConfig);
                    newRoundResults = conversation.map((turn, i) => ({ ...turn, type: 'Technical', feedback: feedbacks[i] }));
                } else if (currentRoundType === 'HR') {
                    const conversation = hrQuestions.map((q, i) => ({ question: q, answer: hrAnswers[i] }));
                    const feedbacks = await getHrInterviewFeedback(conversation);
                    newRoundResults = conversation.map((turn, i) => ({ ...turn, type: 'HR', feedback: feedbacks[i] }));
                }

                const updatedResults = [...roundResults, ...newRoundResults];
                setRoundResults(updatedResults);
                
                if (currentRoundIndex < INTERVIEW_STRUCTURE.length - 1) {
                    setLoadingMessage(`Preparing next round...`);
                    // Await the background promise before proceeding to ensure questions are ready
                    if (backgroundFetchPromise.current) {
                        await backgroundFetchPromise.current;
                    }
                    setCurrentRoundIndex(prev => prev + 1);
                    setCurrentQuestionIndex(0);
                } else {
                    finishInterview(updatedResults);
                }
            } catch(err) {
                setError(`Failed to process the ${currentRoundType} round or load the next one. Please try again.`);
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        } else {
            setCurrentQuestionIndex(prev => prev + 1);
        }
    };


    useEffect(() => {
        if (flow !== 'active' || timeLeft <= 0) {
            if (flow === 'active' && timeLeft === 0) {
                finishInterview(roundResults);
            }
            return;
        }

        const timerId = setInterval(() => {
            setTimeLeft(prev => prev - 1);
        }, 1000);

        return () => clearInterval(timerId);
    }, [flow, timeLeft, finishInterview, roundResults]);

    const startInterview = async () => {
        setIsLoading(true);
        setError(null);
        setLoadingMessage('Generating your first round...');
        
        try {
            sessionStartTimeRef.current = Date.now();
            
            // Step 1: Fetch ONLY the first round (Aptitude) questions to start faster
            const aptiQuestions = await generateAptitudeQuestions([], ROUND_QUESTION_COUNT['Aptitude'], 'Mixed');
            
            setAptitudeQuestions(aptiQuestions);
            setAptitudeAnswers(new Array(aptiQuestions.length).fill(null));

            // Initialize other states as empty
            setTechnicalQuestions([]);
            setTechnicalAnswers([]);
            setHrQuestions([]);
            setHrAnswers([]);
            
            setTimeLeft(duration * 60);
            setCurrentRoundIndex(0);
            setCurrentQuestionIndex(0);
            setRoundResults([]);
            setFlow('active');

            // Step 2: Start fetching other rounds in the background
            const techConfig = {
                role: targetRole,
                experience: 'Intern/Fresher',
                // FIX: Changed techStack from a string to an empty array to match InterviewConfig type.
                techStack: [],
                jobDescription: `The candidate is preparing for a role at a ${targetCompanyTier} company.`,
            };

            backgroundFetchPromise.current = (async () => {
                try {
                    const [techQs, hrQs] = await Promise.all([
                        generateMultipleTechnicalQuestions(techConfig, ROUND_QUESTION_COUNT['Technical']),
                        generateMultipleHrQuestions(ROUND_QUESTION_COUNT['HR'])
                    ]);
                    setTechnicalQuestions(techQs);
                    setTechnicalAnswers(new Array(techQs.length).fill(''));
                    setHrQuestions(hrQs);
                    setHrAnswers(new Array(hrQs.length).fill(''));
                } catch (err) {
                    console.error("Background question fetch failed:", err);
                    // Re-throw to make the promise reject, which will be caught in proceedToNext
                    throw err;
                }
            })();

        } catch (err) {
            setError('Failed to set up the interview. Please check your API key and try again.');
            console.error(err);
            setFlow('setup');
        }
        setIsLoading(false);
    };

    const handleStopInterview = () => setIsStopModalOpen(true);

    const confirmStopInterview = () => {
        setIsStopModalOpen(false);
        onNavigate(Feature.DASHBOARD);
    }
    
    const renderSetup = () => (
        <div className="p-4 md:p-8 max-w-2xl mx-auto animate-fade-in">
            <Card>
                <h2 className="text-3xl font-bold text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-600">Full Mock Interview</h2>
                <p className="text-on-secondary text-center mb-8">Simulate a complete, multi-round interview for your target role.</p>
                <div className="space-y-6">
                    <div>
                        <label className="block text-lg font-semibold text-on-surface mb-2">1. Select Your Target Role</label>
                        <select value={targetRole} onChange={e => setTargetRole(e.target.value)} className="w-full p-3 border rounded-md bg-white/70">
                            {Object.values(TechnicalRole).map(r => <option key={r} value={r}>{r}</option>)}
                            <option value="Data Analyst">Data Analyst</option>
                            <option value="Mechanical Engineer">Mechanical Engineer</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-lg font-semibold text-on-surface mb-2">2. Select Company Tier</label>
                        <select value={targetCompanyTier} onChange={e => setTargetCompanyTier(e.target.value)} className="w-full p-3 border rounded-md bg-white/70">
                            {Object.values(CompanyTier).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-lg font-semibold text-on-surface mb-2">3. Choose Duration</label>
                        <div className="grid grid-cols-3 gap-3">
                            {[45, 60, 90].map(d => (
                                <button key={d} onClick={() => setDuration(d)}
                                    className={`p-3 rounded-lg border-2 font-medium transition-all duration-300 ${duration === d ? 'bg-indigo-600 text-white border-indigo-700 scale-105 shadow-lg' : 'bg-white/50 hover:bg-indigo-100'}`}>
                                    {d} min
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="mt-8 text-center">
                    <button onClick={startInterview} disabled={isLoading} className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold py-4 rounded-lg text-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300">
                        {isLoading ? 'Preparing...' : 'Start Interview'}
                    </button>
                    {error && <p className="text-red-500 mt-4">{error}</p>}
                </div>
            </Card>
        </div>
    );
    
    const renderActive = () => {
        const currentRoundType = INTERVIEW_STRUCTURE[currentRoundIndex];
        const roundQuestionCount = ROUND_QUESTION_COUNT[currentRoundType];
        
        let currentQuestionContent;
        let answerContent;
        let isNextDisabled = false;
        
        if (currentRoundType === 'Aptitude' && aptitudeQuestions.length > 0) {
            const question = aptitudeQuestions[currentQuestionIndex];
            isNextDisabled = !aptitudeAnswers[currentQuestionIndex];
            currentQuestionContent = <p className="text-lg text-on-surface font-medium">{question.question}</p>;
            answerContent = (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {question.options.map((option, index) => (
                        <button key={index} onClick={() => {
                            const newAnswers = [...aptitudeAnswers];
                            newAnswers[currentQuestionIndex] = option;
                            setAptitudeAnswers(newAnswers);
                        }}
                            className={`p-4 rounded-lg text-left transition-all duration-300 border-2 text-on-surface ${aptitudeAnswers[currentQuestionIndex] === option ? 'bg-primary/20 border-primary shadow-inner' : 'bg-white hover:bg-primary/10 border-slate-200'}`}>
                            {option}
                        </button>
                    ))}
                </div>
            );
        } else if (currentRoundType === 'Technical' && technicalQuestions.length > 0) {
            isNextDisabled = !technicalAnswers[currentQuestionIndex]?.trim();
            currentQuestionContent = <p className="text-xl text-on-surface font-semibold">{technicalQuestions[currentQuestionIndex]}</p>;
            answerContent = (
                 <textarea
                    value={technicalAnswers[currentQuestionIndex]}
                    onChange={(e) => {
                        const newAnswers = [...technicalAnswers];
                        newAnswers[currentQuestionIndex] = e.target.value;
                        setTechnicalAnswers(newAnswers);
                    }}
                    placeholder="Type your answer here..."
                    className="w-full h-48 p-4 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition bg-white"
                />
            );
        } else if (currentRoundType === 'HR' && hrQuestions.length > 0) {
            isNextDisabled = !hrAnswers[currentQuestionIndex]?.trim();
            currentQuestionContent = <p className="text-xl text-on-surface font-semibold">{hrQuestions[currentQuestionIndex]}</p>;
            answerContent = (
                 <textarea
                    value={hrAnswers[currentQuestionIndex]}
                    onChange={(e) => {
                         const newAnswers = [...hrAnswers];
                        newAnswers[currentQuestionIndex] = e.target.value;
                        setHrAnswers(newAnswers);
                    }}
                    placeholder="Structure your answer using the STAR method..."
                    className="w-full h-48 p-4 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition bg-white"
                />
            );
        } else {
             return <div className="flex flex-col items-center justify-center min-h-screen"><Spinner /><p className="mt-4 text-on-secondary">Loading questions...</p></div>;
        }

        return (
            <div className="p-2 md:p-4 h-screen bg-transparent">
                 <ConfirmationModal isOpen={isStopModalOpen} onClose={() => setIsStopModalOpen(false)} onConfirm={confirmStopInterview} title="See It Through!" message="This is the final boss! Simulating a full interview is the best possible preparation. You're so close to the finish line. Keep that energy going!" confirmText="Yes, Stop Interview" cancelText="I Can Do This!" />
                <div className="bg-surface rounded-2xl shadow-2xl flex flex-col h-full max-w-5xl mx-auto border border-white/20">
                    <header className="p-4 border-b border-slate-200">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-600">Mock Interview</h2>
                            <div className="flex items-center gap-4">
                                <div className="text-lg font-semibold text-red-600 bg-red-100 px-3 py-1 rounded-full">{formatTime(timeLeft)}</div>
                                <button onClick={handleStopInterview} className="text-sm text-primary hover:text-primary-dark font-semibold flex items-center bg-white hover:bg-primary/10 border-2 border-slate-200 px-3 py-1.5 rounded-full"><IconHome /><span className="ml-1">End</span></button>
                            </div>
                        </div>
                        <InterviewStepper rounds={INTERVIEW_STRUCTURE} currentRoundIndex={currentRoundIndex} />
                    </header>

                    <main className="flex-grow overflow-y-auto p-6 flex flex-col">
                        {isLoading && <div className="m-auto text-center"><Spinner size="lg" /><p className="mt-4 text-on-secondary">{loadingMessage}</p></div>}
                        
                        {!isLoading && <>
                            <div className="mb-4">
                                <div className="flex justify-between items-center mb-1">
                                    <h3 className="text-lg font-bold text-on-surface">Question {currentQuestionIndex + 1} of {roundQuestionCount}</h3>
                                    <p className="text-sm font-semibold text-on-secondary">{currentRoundType} Round</p>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2"><div className="bg-gradient-to-r from-blue-400 to-indigo-500 h-2 rounded-full" style={{ width: `${((currentQuestionIndex + 1) / roundQuestionCount) * 100}%`}}></div></div>
                            </div>
                            
                            <div className="bg-slate-50/50 p-6 rounded-lg my-6 flex-grow flex flex-col justify-center">
                                {currentQuestionContent}
                            </div>
                            
                            <div className="mt-auto">
                                {answerContent}
                            </div>
                        </>}
                    </main>
                    
                    {!isLoading && <footer className="p-4 border-t flex justify-end">
                         <button onClick={proceedToNext} disabled={isNextDisabled} className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold py-3 px-8 rounded-lg transition disabled:from-slate-400 disabled:to-slate-400">
                            {currentQuestionIndex < roundQuestionCount - 1 ? 'Next Question' : currentRoundIndex < INTERVIEW_STRUCTURE.length -1 ? 'Finish Round' : 'Finish Interview'}
                        </button>
                    </footer>}
                </div>
            </div>
        );
    };
    
    const renderResults = () => (
         <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in">
            <header className="text-center mb-8">
                <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-600">Mock Interview Report</h2>
                <p className="text-on-secondary mt-2">Here's the complete breakdown of your performance.</p>
            </header>
            
            {isLoading && <div className="text-center p-8"><Spinner /><p className="mt-4 text-on-secondary">{loadingMessage}</p></div>}
            
            {!isLoading && (
                 <div>
                    <Card className="mb-8 bg-gradient-to-br from-indigo-50 to-blue-50">
                        <h3 className="text-3xl font-bold text-on-surface mb-4 text-center">Hiring Manager's Summary</h3>
                        <div className="p-4 rounded-lg">
                             <SimpleMarkdown text={overallFeedback} />
                        </div>
                    </Card>
                    
                    <h3 className="text-2xl font-bold text-on-surface mb-4">Round-by-Round Breakdown</h3>
                    
                    {INTERVIEW_STRUCTURE.map(roundType => {
                        const roundData = finalResults.filter(r => r.type === roundType);
                        if (roundData.length === 0) return null;
                        
                        return (
                            <details key={roundType} className="bg-white/50 p-4 rounded-lg group border border-slate-200 mb-4" open>
                                <summary className="font-semibold text-on-surface cursor-pointer flex justify-between items-center list-none text-xl">
                                    {roundType} Round
                                    {roundType === 'Aptitude' && <span className="text-lg font-bold text-primary">{roundData[0].score?.toFixed(0)}%</span>}
                                    <svg className="w-5 h-5 transform transition-transform group-open:rotate-180 text-on-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </summary>
                                <div className="mt-4 pt-4 border-t border-slate-200 space-y-6">
                                    {roundType === 'Aptitude' && (
                                        <div className="text-center">
                                            <p className="text-lg">Score: <span className="font-bold">{roundData[0].correctAnswers}/{roundData[0].total}</span> correct</p>
                                        </div>
                                    )}
                                    {roundData.filter(r => r.type !== 'Aptitude').map((result, index) => (
                                        <div key={index}>
                                            <p className="font-bold text-on-secondary mb-2">Question {index+1}:</p>
                                            <p className="p-3 bg-slate-100 rounded-md mb-2">{result.question}</p>
                                            <p className="font-bold text-on-secondary mb-2">Your Answer:</p>
                                            <p className="p-3 bg-slate-100 rounded-md whitespace-pre-wrap mb-2">{result.answer}</p>
                                            <p className="font-bold text-primary mb-2">Feedback:</p>
                                            <div className="p-3 bg-primary/10 rounded-md"><SimpleMarkdown text={result.feedback || ''} /></div>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )
                    })}
                    
                    <div className="mt-8 text-center space-x-4">
                        <button onClick={() => onNavigate(Feature.DASHBOARD)} className="bg-on-surface text-white font-bold py-3 px-8 rounded-lg hover:bg-on-surface/80 transition-all">Back to Dashboard</button>
                        <button onClick={() => setFlow('setup')} className="bg-gradient-to-r from-primary to-secondary text-white font-bold py-3 px-8 rounded-lg">Try Another Mock</button>
                    </div>
                </div>
            )}
         </div>
    );

    switch(flow) {
        case 'active': return renderActive();
        case 'results': return renderResults();
        case 'setup':
        default: return renderSetup();
    }
};

const InterviewStepper: React.FC<{ rounds: string[], currentRoundIndex: number }> = ({ rounds, currentRoundIndex }) => {
    const icons: { [key: string]: React.ReactNode } = {
        'Aptitude': <IconCalculator />,
        'Technical': <IconCode />,
        'HR': <IconUsers />,
    };

    return (
        <div className="flex items-center justify-center">
            {rounds.map((round, index) => {
                const isCompleted = index < currentRoundIndex;
                const isActive = index === currentRoundIndex;
                return (
                    <React.Fragment key={round}>
                        <div className="flex flex-col items-center">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 transition-all duration-500 ${
                                isActive ? 'bg-indigo-600 border-indigo-700 text-white scale-110' :
                                isCompleted ? 'bg-green-500 border-green-600 text-white' :
                                'bg-slate-200 border-slate-300 text-slate-500'
                            }`}>
                                {isCompleted ? <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : icons[round]}
                            </div>
                            <p className={`mt-2 font-semibold text-sm ${isActive ? 'text-indigo-600' : 'text-on-secondary'}`}>{round}</p>
                        </div>
                        {index < rounds.length - 1 && (
                            <div className={`flex-1 h-1 mx-2 rounded-full transition-colors duration-500 ${isCompleted ? 'bg-green-500' : 'bg-slate-200'}`} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default MockInterview;