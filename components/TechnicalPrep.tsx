

import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { TechnicalRole, Feature, InterviewHistory, TechnicalDataReference } from '../types';
import { generateTechnicalQuestion, getTechnicalSessionFeedback, generateFollowUpQuestion, getTechnicalInterviewFeedback, InterviewConfig } from '../services/geminiService';
import { saveInterviewHistory } from '../services/firestoreService';
import Card from './shared/Card';
import Spinner from './shared/Spinner';
import ConfirmationModal from './shared/ConfirmationModal';

// A simple markdown parser, enhanced for better code blocks and headings.
const SimpleMarkdown: React.FC<{ text: string }> = ({ text }) => {
    if (!text) return null;
    const formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/```([\s\S]*?)```/g, (_match, code) => `<pre class="bg-slate-800 text-white p-4 rounded-md my-4 overflow-x-auto"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
        .replace(/`(.*?)`/g, '<code class="bg-slate-200 text-accent font-mono px-1.5 py-0.5 rounded-md">$1</code>')
        .replace(/^(###\s.*)/gm, (match) => `<h3 class="text-xl font-bold mt-4 mb-2">${match.substring(4)}</h3>`)
        .replace(/^(##\s.*)/gm, (match) => `<h2 class="text-2xl font-bold mt-6 mb-3 border-b pb-2">${match.substring(3)}</h2>`)
        .replace(/^(#\s.*)/gm, (match) => `<h1 class="text-3xl font-bold mt-8 mb-4 border-b pb-3">${match.substring(2)}</h1>`)
        .replace(/\n/g, '<br />');

    return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: formattedText }} />;
};


interface TechnicalPrepProps {
    setIsQuizActive: (isActive: boolean) => void;
    user: User;
    onNavigate: (feature: Feature) => void;
}

type ConversationTurn = {
    question: string;
    answer: string;
};

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// --- SVG Icons ---
const IconHome = () => <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
const IconSpeaker = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M11.25 4.532c.5-.522 1.25-.522 1.75 0l5.25 5.513c.5.522.5 1.378 0 1.9l-5.25 5.513c-.5.522-1.25-.522-1.75 0a1.25 1.25 0 010-1.768L14.25 12l-3-3.152a1.25 1.25 0 010-1.768zM5.25 4.532c.5-.522 1.25-.522 1.75 0l5.25 5.513c.5.522.5 1.378 0 1.9l-5.25 5.513c-.5.522-1.25-.522-1.75 0a1.25 1.25 0 010-1.768L8.25 12 5.25 8.848a1.25 1.25 0 010-1.768z" /></svg>;
const IconMic: React.FC<{ isRecording: boolean }> = ({ isRecording }) => (
    <svg className={`h-6 w-6 transition-colors ${isRecording ? 'text-red-500' : 'text-on-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
);


const TechnicalPrep: React.FC<TechnicalPrepProps> = ({ setIsQuizActive, user, onNavigate }) => {
    const [flow, setFlow] = useState<'setup' | 'active' | 'results'>('setup');
    const bottomRef = useRef<null | HTMLDivElement>(null);
    const sessionStartTimeRef = useRef<number | null>(null);

    // Setup state
    const [role, setRole] = useState(TechnicalRole.FULLSTACK);
    const [experience, setExperience] = useState('Intern/Fresher (0-1 years)');
    const [techStack, setTechStack] = useState('React, Node.js, TypeScript');
    const [jobDescription, setJobDescription] = useState('');

    const [conversation, setConversation] = useState<ConversationTurn[]>([]);
    const [finalReport, setFinalReport] = useState('');
    const [currentQuestion, setCurrentQuestion] = useState('');
    const [currentAnswer, setCurrentAnswer] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isStopModalOpen, setIsStopModalOpen] = useState(false);
    
    const [isRecording, setIsRecording] = useState(false);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        setIsQuizActive(flow === 'active');
    }, [flow, setIsQuizActive]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversation, currentQuestion, isLoading]);

     useEffect(() => {
        if (!SpeechRecognition) {
            console.warn("Speech recognition is not supported in this browser.");
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setCurrentAnswer(prev => prev ? `${prev.trim()} ${transcript}` : transcript);
        };

        recognition.onend = () => {
            setIsRecording(false);
        };
        
        recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event.error);
            setError(`Mic error: ${event.error}. Please ensure access is allowed.`);
            setIsRecording(false);
        };

        recognitionRef.current = recognition;

        return () => {
            speechSynthesis.cancel();
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    const speak = (text: string) => {
        try {
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            speechSynthesis.speak(utterance);
        } catch (e) {
            console.error("Text-to-speech failed", e);
        }
    };

    const toggleRecording = () => {
        if (!recognitionRef.current) return;
        if (isRecording) {
            recognitionRef.current.stop();
        } else {
            try {
                recognitionRef.current.start();
                setIsRecording(true);
                setError(null);
            } catch (e) {
                 setError(`Mic error: Could not start recording. Please check permissions.`);
                 console.error("Mic start error", e);
            }
        }
    };

    const getInterviewConfig = (): InterviewConfig => ({
        role,
        experience,
        techStack: techStack.split(',').map(s => s.trim()).filter(Boolean),
        jobDescription,
    });

    const startInterview = async () => {
        setIsLoading(true);
        setLoadingMessage('Preparing your first question...');
        setError(null);

        try {
            sessionStartTimeRef.current = Date.now();
            const firstQuestion = await generateTechnicalQuestion(getInterviewConfig());
            setCurrentQuestion(firstQuestion);
            speak(firstQuestion);
            setCurrentAnswer('');
            setConversation([]);
            setFinalReport('');
            setFlow('active');
        } catch (err) {
            setError('Failed to start the interview. Please check your API key.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmitAnswer = async () => {
        if (isRecording) {
            toggleRecording();
        }
        if (!currentAnswer.trim()) return;

        setIsLoading(true);
        setLoadingMessage('Preparing the next question...');
        setError(null);
        
        const newTurn = { question: currentQuestion, answer: currentAnswer };
        const updatedConversation = [...conversation, newTurn];
        
        setConversation(updatedConversation);
        setCurrentAnswer('');
        setCurrentQuestion('');

        try {
            const followUpQuestion = await generateFollowUpQuestion(updatedConversation, getInterviewConfig());
            setCurrentQuestion(followUpQuestion);
            speak(followUpQuestion);
        } catch (err) {
            setError('Failed to process your answer. You can try ending the session to get feedback on your progress so far.');
            console.error(err);
            setCurrentQuestion(newTurn.question); // Restore question on error
        } finally {
            setIsLoading(false);
        }
    };

    const handleEndSession = async () => {
        if (isRecording) {
            toggleRecording();
        }

        let finalConversation = [...conversation];

        if (currentAnswer.trim()) {
            finalConversation.push({ question: currentQuestion, answer: currentAnswer });
        }
            
        if (finalConversation.length === 0) {
            setFlow('setup');
            return;
        }

        setFlow('results');
        setIsLoading(true);
        setLoadingMessage('Generating your final feedback report...');
        setError(null);

        try {
            const interviewConfig = getInterviewConfig();
            setLoadingMessage('Analyzing your answers...');
            const perQuestionFeedback = await getTechnicalInterviewFeedback(finalConversation, interviewConfig);
            
            setLoadingMessage('Synthesizing your final report...');
            const { rating, summary, report } = await getTechnicalSessionFeedback(finalConversation, interviewConfig);
            setFinalReport(report);
            
            const durationSeconds = sessionStartTimeRef.current ? (Date.now() - sessionStartTimeRef.current) / 1000 : 0;
            const historyData: Omit<InterviewHistory, 'id'|'userId'|'timestamp'> = {
                type: 'technical',
                sessionId: sessionStartTimeRef.current?.toString() || new Date().toISOString(),
                durationSeconds: durationSeconds,
                scoreRating: rating,
                summary: summary,
                dataReference: {
                    role: interviewConfig.role,
                    experience: interviewConfig.experience,
                    techStack: interviewConfig.techStack,
                    jobDescription: interviewConfig.jobDescription,
                    questionsAnswered: finalConversation.length,
                    qAndA_list: finalConversation.map((turn, i) => ({
                        question: turn.question,
                        answer: turn.answer,
                        feedback_summary: perQuestionFeedback[i] || "N/A"
                    })),
                    fullReport: report
                } as TechnicalDataReference
            };
            await saveInterviewHistory(user.uid, historyData);

        } catch (err) {
            setError('Failed to generate or save your final report.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStopSession = () => setIsStopModalOpen(true);
    const confirmStopSession = () => {
        setIsStopModalOpen(false);
        onNavigate(Feature.DASHBOARD);
    };

    if (flow === 'setup') {
        return (
            <div className="p-4 md:p-8 max-w-2xl mx-auto animate-fade-in">
                <Card>
                    <h2 className="text-3xl font-bold text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-accent to-[#d48444]">Technical Interview Prep</h2>
                    <p className="text-on-secondary text-center mb-8">Configure the interview to match your target role and get realistic, voice-enabled practice.</p>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-on-secondary mb-1">Target Role</label>
                            {/* FIX: Cast string value to TechnicalRole to match state type */}
                            <select value={role} onChange={e => setRole(e.target.value as TechnicalRole)} className="w-full p-2 border rounded-md bg-white/70">
                                {Object.values(TechnicalRole).map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-on-secondary mb-1">Experience Level</label>
                            <input type="text" value={experience} onChange={e => setExperience(e.target.value)} className="w-full p-2 border rounded-md bg-white/70" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-on-secondary mb-1">Key Technologies (comma-separated)</label>
                            <input type="text" value={techStack} onChange={e => setTechStack(e.target.value)} placeholder="e.g., React, Python, AWS" className="w-full p-2 border rounded-md bg-white/70" />
                        </div>
                         <div>
                            <label className="block text-sm font-bold text-on-secondary mb-1">Job Description (Optional)</label>
                            <textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)} placeholder="Paste a relevant job description here for more targeted questions." className="w-full p-2 border rounded-md bg-white/70 h-24" />
                        </div>
                    </div>
                    <button onClick={startInterview} disabled={isLoading} className="w-full mt-8 bg-gradient-to-r from-accent to-[#d48444] text-white font-bold py-3 px-12 rounded-lg text-lg hover:shadow-xl transform hover:scale-105 transition disabled:from-slate-400">
                        {isLoading ? 'Preparing...' : 'Start Interview'}
                    </button>
                    {error && <p className="text-red-500 my-4 text-center">{error}</p>}
                </Card>
            </div>
        );
    }
    
    if (flow === 'results') {
        return (
             <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in">
                <Card>
                    {isLoading && <div className="text-center p-8"><Spinner /><p className="mt-4 text-on-secondary">{loadingMessage}</p></div>}
                    {error && <p className="text-red-500 my-4 text-center p-3 bg-red-100 rounded-lg">{error}</p>}

                    {!isLoading && (
                        <div className="bg-slate-50/50 p-6 rounded-lg text-on-surface">
                           <SimpleMarkdown text={finalReport} />
                        </div>
                    )}
                    <div className="mt-8 flex gap-4 justify-center">
                        <button onClick={() => onNavigate(Feature.DASHBOARD)} className="bg-slate-200 text-on-secondary font-semibold py-3 px-8 rounded-lg hover:bg-slate-300 transition">Dashboard</button>
                        <button onClick={() => setFlow('setup')} className="bg-gradient-to-r from-accent to-[#d48444] text-white font-bold py-3 px-8 rounded-lg hover:shadow-lg transition">New Interview</button>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-2 md:p-4 h-screen bg-transparent">
            <ConfirmationModal isOpen={isStopModalOpen} onClose={() => setIsStopModalOpen(false)} onConfirm={handleEndSession} title="End Session?" message="Are you sure you want to end this interview? You can get your final report based on the questions you've answered so far." confirmText="Yes, Finish & Get Feedback" cancelText="Keep Going!" />
            <div className="bg-surface rounded-2xl shadow-2xl flex flex-col h-full max-w-4xl mx-auto border border-white/20">
                <header className="flex justify-between items-center p-4 border-b border-slate-200 flex-shrink-0">
                  <div>
                    <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-accent to-[#d48444]">Technical Interview</h2>
                     <p className="font-semibold text-on-secondary text-sm">Question {conversation.length + 1}</p>
                  </div>
                  <button onClick={handleStopSession} className="text-sm text-primary hover:text-primary-dark font-semibold flex items-center bg-white hover:bg-primary/10 border-2 border-slate-200 hover:border-primary/20 px-3 py-1.5 rounded-full transition-colors shadow-sm">
                        <IconHome /> <span className="ml-1.5">End Session</span>
                  </button>
                </header>
                
                <main className="flex-grow space-y-6 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
                    {conversation.map((turn, index) => (
                        <React.Fragment key={index}>
                            <div className="flex justify-start animate-fade-in">
                                <div className="bg-white rounded-xl rounded-bl-none p-4 max-w-lg shadow-sm border border-slate-100">
                                    <p className="text-on-surface">{turn.question}</p>
                                </div>
                            </div>
                            <div className="flex justify-end animate-fade-in">
                                <div className="bg-gradient-to-br from-accent to-[#d48444] text-white rounded-xl rounded-br-none p-4 max-w-lg shadow-md">
                                    <p className="whitespace-pre-wrap">{turn.answer}</p>
                                </div>
                            </div>
                        </React.Fragment>
                    ))}

                    {currentQuestion && (
                         <div className="flex justify-start animate-fade-in">
                            <div className="bg-white rounded-xl rounded-bl-none p-4 max-w-lg shadow-sm border border-slate-100">
                               <div className="flex items-start">
                                    <p className="text-on-surface flex-grow">{currentQuestion}</p>
                                    <button onClick={() => speak(currentQuestion)} className="ml-2 text-on-secondary hover:text-primary p-1 rounded-full flex-shrink-0"><IconSpeaker /></button>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {isLoading && (
                        <div className="flex justify-start animate-fade-in">
                            <div className="bg-white rounded-xl rounded-bl-none p-4 max-w-lg shadow-sm border border-slate-100">
                               <div className="flex items-center space-x-1.5">
                                   <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                   <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                   <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce"></div>
                               </div>
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </main>

                <footer className="border-t border-slate-200 p-4 bg-white/70 backdrop-blur-sm flex-shrink-0">
                    {error && <p className="text-red-600 text-center text-sm mb-2 p-2 bg-red-100 rounded-md">{error}</p>}
                    <div className="relative">
                        <textarea
                            value={currentAnswer}
                            onChange={(e) => setCurrentAnswer(e.target.value)}
                            placeholder={isRecording ? "Listening..." : "Type or use the mic to answer..."}
                            className="w-full h-28 p-4 pr-12 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition bg-white"
                            disabled={isLoading || !currentQuestion}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmitAnswer();
                                }
                            }}
                        />
                        {SpeechRecognition && 
                            <button 
                                onClick={toggleRecording} 
                                disabled={isLoading || !currentQuestion}
                                className="absolute bottom-3 right-3 p-2 rounded-full hover:bg-slate-200 transition-colors disabled:opacity-50"
                                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                            >
                                <IconMic isRecording={isRecording} />
                            </button>
                        }
                    </div>
                    <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-end">
                        <button onClick={handleEndSession} disabled={isLoading} className="bg-slate-600 text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-slate-700 transition disabled:bg-slate-400">
                            Finish and Get Feedback
                        </button>
                        <button onClick={handleSubmitAnswer} disabled={!currentAnswer.trim() || isLoading || !currentQuestion}
                            className="bg-accent text-white font-bold py-2.5 px-6 rounded-lg hover:bg-[#a15828] shadow-sm hover:shadow-md transition disabled:bg-slate-400 disabled:shadow-none">
                            Submit Answer
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default TechnicalPrep;
