import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import { GDChatMessage, Feature, InterviewHistory, GroupDiscussionDataReference } from '../types';
import { generateGdTopics, orchestrateGdTurn, generateGdOpeningStatement } from '../services/geminiService';
import { saveInterviewHistory } from '../services/firestoreService';
import Card from './shared/Card';
import Spinner from './shared/Spinner';
import ConfirmationModal from './shared/ConfirmationModal';

// Fix: Correctly type SpeechRecognition to be constructable, handling vendor prefixes.
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

const IconHome = () => <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;

interface GroupDiscussionProps {
    setIsQuizActive: (isActive: boolean) => void;
    user: User;
    onNavigate: (feature: Feature) => void;
}

const GroupDiscussion: React.FC<GroupDiscussionProps> = ({ setIsQuizActive, user, onNavigate }) => {
    const [flow, setFlow] = useState<'loading' | 'setup' | 'active' | 'finished'>('loading');
    const [duration, setDuration] = useState(5); // in minutes
    const [timeLeft, setTimeLeft] = useState(0);

    const [topics, setTopics] = useState<{ topic: string; description: string }[]>([]);
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
    const [chatLog, setChatLog] = useState<GDChatMessage[]>([]);

    const [ai1Name, setAi1Name] = useState('Alex');
    const [ai2Name, setAi2Name] = useState('Ben');
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isRecording, setIsRecording] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    
    const [isStopModalOpen, setIsStopModalOpen] = useState(false);
    const recognitionRef = useRef<any>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const sessionStartTimeRef = useRef<number | null>(null);

    useEffect(() => {
        setIsQuizActive(flow === 'active');
    }, [flow, setIsQuizActive]);

    const fetchTopics = useCallback(async () => {
        setFlow('loading');
        setError(null);
        setSelectedTopic(null);
        try {
            const t = await generateGdTopics();
            setTopics(t);
            setFlow('setup');
        } catch (err) {
            setError('Failed to generate a topic. Please check your API key.');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchTopics();
    }, [fetchTopics]);

    useEffect(() => {
        if (!SpeechRecognition) {
            setError('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
            return;
        }
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            if (transcript) {
                handleUserMessage(transcript);
            }
        };
        recognitionRef.current.onend = () => setIsRecording(false);
        recognitionRef.current.onerror = (event: any) => {
            console.error('Speech recognition error', event.error);
            setError(`Speech recognition error: ${event.error}. Please ensure microphone access is allowed.`);
            setIsRecording(false);
        };
    }, []);

    useEffect(() => {
        // Cleanup function to stop any ongoing speech synthesis or recognition when the component unmounts
        return () => {
            speechSynthesis.cancel();
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []); // Empty dependency array ensures this runs only on mount and unmount

    useEffect(() => {
        if (flow !== 'active' || timeLeft <= 0) {
            if (flow === 'active' && timeLeft === 0) {
                setFlow('finished');
                speechSynthesis.cancel();
                if(recognitionRef.current) recognitionRef.current.stop();
            }
            return;
        }

        const timerId = setInterval(() => {
            setTimeLeft(prev => prev - 1);
        }, 1000);

        return () => clearInterval(timerId);
    }, [flow, timeLeft]);
    
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatLog]);

    const speakText = (text: string, participant: string, onEnd: () => void) => {
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = speechSynthesis.getVoices();
        // Try to find a different voice for the second AI participant
        if (participant === ai2Name && voices.length > 1) {
            const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Zira'));
            if (femaleVoice) {
                utterance.voice = femaleVoice;
            } else {
                utterance.voice = voices[1]; // Fallback to the second voice
            }
        }
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
            setIsSpeaking(false);
            onEnd();
        };
        speechSynthesis.speak(utterance);
    };

    const handleAiTurn = async () => {
        if (!selectedTopic) return;
        setIsThinking(true);
        const history = chatLog.map(m => `${m.participant}: ${m.message}`).join('\n');
        try {
            const aiResponses = await orchestrateGdTurn(selectedTopic, history, ai1Name, ai2Name);
            
            // Sequentially speak each AI response
            const speakSequentially = (index: number) => {
                if (index < aiResponses.length) {
                    const response = aiResponses[index];
                    setChatLog(prev => [...prev, response]);
                    speakText(response.message, response.participant, () => speakSequentially(index + 1));
                }
            };
            
            speakSequentially(0);

        } catch (err) {
            console.error(err);
            const errorMessage = { participant: 'System', message: "I'm having trouble connecting. Let's try again." };
            setChatLog(prev => [...prev, errorMessage]);
        } finally {
            setIsThinking(false);
        }
    };
    
    const handleUserMessage = (transcript: string) => {
        const newUserMessage: GDChatMessage = { participant: 'You', message: transcript };
        setChatLog(prev => [...prev, newUserMessage]);
        setTimeout(handleAiTurn, 500); // Give a slight delay before AI responds
    };

    const toggleRecording = () => {
        if (isRecording) {
            recognitionRef.current?.stop();
        } else if (!isSpeaking && !isThinking) {
            recognitionRef.current?.start();
            setIsRecording(true);
        }
    };

    const handleStartDiscussion = async () => {
        if (!selectedTopic) return;
        sessionStartTimeRef.current = Date.now();
        setTimeLeft(duration * 60);
        setChatLog([]);
        setFlow('active');

        setIsThinking(true);
        try {
            const openingMessage = await generateGdOpeningStatement(selectedTopic);
            setChatLog([{ participant: 'Moderator', message: openingMessage }]);
        } catch (err) {
            setError("Failed to start the discussion. Please try again.");
            setFlow('setup');
        } finally {
            setIsThinking(false);
        }
    };

    const handleSaveAndEnd = async () => {
        if (!user || chatLog.length === 0 || !selectedTopic) {
            onNavigate(Feature.DASHBOARD);
            return;
        }
        setIsLoading(true);
        try {
            const durationSeconds = sessionStartTimeRef.current ? (Date.now() - sessionStartTimeRef.current) / 1000 : duration * 60;
            const userTurns = chatLog.filter(m => m.participant === 'You').length;

            const historyData: Omit<InterviewHistory, 'id'|'userId'|'timestamp'> = {
                type: 'group_discussion',
                sessionId: sessionStartTimeRef.current?.toString() || new Date().toISOString(),
                durationSeconds: durationSeconds,
                summary: `Participated in a group discussion on "${selectedTopic}".`,
                dataReference: {
                    topic: selectedTopic,
                    userTurns: userTurns,
                    chatLog: chatLog,
                } as GroupDiscussionDataReference
            };
            await saveInterviewHistory(user.uid, historyData);
            onNavigate(Feature.DASHBOARD);
        } catch (err) {
            setError("Failed to save your discussion. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading || flow === 'loading') {
        return <div className="flex flex-col items-center justify-center min-h-screen"><Spinner /><p className="mt-4 text-on-secondary">Generating discussion topics...</p></div>;
    }

    if (error) {
        return <div className="text-center p-8"><p className="text-red-500 font-semibold">{error}</p><button onClick={fetchTopics} className="mt-4 bg-gradient-to-r from-primary to-secondary text-white font-bold py-2 px-6 rounded-lg">Try Again</button></div>;
    }

    if (flow === 'setup') {
        return (
             <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in">
                <Card className="text-center">
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Voice-based Group Discussion</h2>
                    <p className="text-on-secondary mt-4 mb-6">Choose one of the following topics to begin the discussion.</p>

                    <div className="space-y-4 text-left mb-8">
                        {topics.map((t, index) => (
                            <div
                                key={index}
                                onClick={() => setSelectedTopic(t.topic)}
                                className={`p-6 rounded-xl border-2 cursor-pointer transition-all duration-300 ${
                                    selectedTopic === t.topic
                                        ? 'border-primary bg-primary/10 scale-105 shadow-lg'
                                        : 'border-slate-200 bg-white/50 hover:border-primary/50'
                                }`}
                            >
                                <h3 className="font-bold text-lg text-on-surface mb-2">{t.topic}</h3>
                                <p className="text-on-secondary text-sm leading-relaxed">{t.description}</p>
                            </div>
                        ))}
                    </div>
                    
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center border-t pt-6">
                        <div className="md:col-span-1">
                             <label className="block text-lg font-semibold text-on-surface mb-2">Duration</label>
                            <div className="grid grid-cols-3 gap-3">
                                {[5, 10, 15].map(d => (
                                    <button key={d} onClick={() => setDuration(d)}
                                        className={`p-3 rounded-lg border-2 font-medium transition-all duration-300 ${duration === d ? 'bg-primary text-white border-primary-dark scale-105 shadow-lg' : 'bg-white/50 hover:bg-primary/10'}`}>
                                        {d} min
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="md:col-span-1">
                            <label className="block text-lg font-semibold text-on-surface mb-2">AI Names</label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input type="text" value={ai1Name} onChange={e => setAi1Name(e.target.value)} placeholder="Analyst" className="w-full p-2 border-2 rounded-md bg-white/50 focus:ring-1 focus:ring-primary" />
                                <input type="text" value={ai2Name} onChange={e => setAi2Name(e.target.value)} placeholder="Visionary" className="w-full p-2 border-2 rounded-md bg-white/50 focus:ring-1 focus:ring-primary" />
                            </div>
                        </div>

                        <button 
                            onClick={handleStartDiscussion} 
                            disabled={!selectedTopic || isLoading}
                            className="w-full md:col-span-1 bg-gradient-to-r from-primary to-secondary text-white font-bold py-4 px-12 rounded-lg text-lg hover:shadow-xl transform hover:scale-105 transition disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none disabled:scale-100 disabled:cursor-not-allowed"
                        >
                            Start
                        </button>
                    </div>
                </Card>
            </div>
        )
    }
    
     if (flow === 'finished') {
        return (
            <div className="p-4 md:p-8 max-w-2xl mx-auto animate-fade-in flex items-center justify-center min-h-[80vh]">
                <Card className="text-center">
                    <h2 className="text-3xl font-bold text-on-surface mb-4">Time's Up!</h2>
                    <p className="text-on-secondary mb-8">Great discussion! You can now save your session to review later or start a new one.</p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button onClick={handleSaveAndEnd} disabled={isLoading} className="w-full sm:w-auto bg-gradient-to-r from-primary to-secondary text-white font-bold py-3 px-8 rounded-lg hover:shadow-xl disabled:from-slate-400">
                            {isLoading ? 'Saving...' : 'Save & Exit'}
                        </button>
                        <button onClick={fetchTopics} className="w-full sm:w-auto text-on-secondary font-semibold py-3 px-6 hover:text-primary transition">
                            Start New Discussion
                        </button>
                    </div>
                </Card>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in">
             <ConfirmationModal
                isOpen={isStopModalOpen}
                onClose={() => setIsStopModalOpen(false)}
                onConfirm={() => onNavigate(Feature.DASHBOARD)}
                title="End Discussion?"
                message="Are you sure you want to end this discussion? Your progress won't be saved."
                confirmText="Yes, End"
                cancelText="Stay in!"
            />
            <Card>
                <div className="flex justify-between items-center mb-2">
                     <div>
                        <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Group Discussion</h2>
                        <p className="text-on-secondary text-sm font-semibold">{selectedTopic}</p>
                     </div>
                    <div className="flex items-center gap-4">
                        <div className="text-lg font-semibold text-red-600 bg-red-100 px-3 py-1 rounded-full shadow-sm">{formatTime(timeLeft)}</div>
                        <button onClick={() => setIsStopModalOpen(true)} className="text-sm text-primary hover:text-primary-dark font-semibold flex items-center bg-white hover:bg-primary/10 border-2 border-slate-200 hover:border-primary/20 px-3 py-1.5 rounded-full transition-colors shadow-sm">
                            <IconHome /> <span className="ml-1">End</span>
                        </button>
                    </div>
                </div>
                
                <div className="h-[60vh] bg-slate-50/50 rounded-lg p-4 overflow-y-auto space-y-4 border">
                    {chatLog.map((chat, index) => {
                        const isUser = chat.participant === 'You';
                        const isModerator = chat.participant === 'Moderator';
                        const participantName = chat.participant;
                        const avatar = isUser ? '👤' : isModerator ? '⚖️' : (participantName === ai1Name ? '🤖' : '💡');
                        const alignment = isUser ? 'justify-end' : 'justify-start';
                        const bgColor = isUser 
                            ? 'bg-gradient-to-br from-primary to-secondary text-white rounded-br-none'
                            : isModerator 
                                ? 'bg-slate-200 text-on-surface rounded-bl-none'
                                : 'bg-white text-on-surface rounded-bl-none';
                        
                        return (
                            <div key={index} className={`flex ${alignment} animate-fade-in`}>
                                <div className={`rounded-xl py-2 px-4 max-w-sm shadow-md ${bgColor}`}>
                                    <p className="font-bold text-sm opacity-70 flex items-center">{avatar} <span className="ml-2">{participantName}</span></p>
                                    <p>{chat.message}</p>
                                </div>
                            </div>
                        )
                    })}
                    {isThinking && 
                        <div className="flex justify-start">
                             <div className="rounded-xl py-2 px-4 max-w-sm shadow-md bg-white text-on-surface rounded-bl-none">
                                <div className="flex items-center space-x-1.5">
                                   <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                   <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                   <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce"></div>
                               </div>
                             </div>
                        </div>
                    }
                    <div ref={chatEndRef} />
                </div>
                
                <div className="mt-6 flex justify-center">
                    <button
                        onClick={toggleRecording}
                        disabled={isSpeaking || isThinking}
                        className={`relative w-20 h-20 rounded-full transition-all duration-300 flex items-center justify-center ${
                            isRecording 
                                ? 'bg-red-500 text-white shadow-lg scale-110' 
                                : 'bg-primary text-white hover:bg-primary-dark disabled:bg-slate-400'
                        }`}
                        aria-label={isRecording ? 'Stop speaking' : 'Start speaking'}
                    >
                        {isRecording ? (
                             <div className="w-6 h-6 bg-white rounded-md"></div>
                        ) : (
                            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"></path></svg>
                        )}
                        {isSpeaking && <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center text-white text-xs font-bold">AI Speaking</div>}
                        {isThinking && <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center text-white text-xs font-bold">AI Thinking</div>}
                    </button>
                </div>
            </Card>
        </div>
    );
};

export default GroupDiscussion;