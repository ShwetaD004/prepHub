import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { InterviewHistory } from '../types';
import { getInterviewHistory } from '../services/firestoreService';
import Spinner from './shared/Spinner';

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
        .replace(/<br \/>/g, '\n').replace(/\n/g, '<br />'); // Normalize line breaks

    return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: formattedText }} />;
};


const formatDate = (timestamp: any) => {
    return timestamp?.toDate ? timestamp.toDate().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'Just now';
};

const IconCalculator: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => ( <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7h16M4 12h16M4 17h16M12 4v16"/></svg> );
const IconCode: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => ( <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg> );
const IconUsers: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => ( <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197" /></svg> );
const IconChat: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => ( <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V4a2 2 0 012-2h6.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V8z" /></svg> );
const IconDocument: React.FC<{className?: string}> = ({ className = "h-6 w-6" }) => ( <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> );
const IconBriefcase: React.FC<{className?: string}> = ({ className = "h-6 w-6" }) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
const IconBookmark: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>;

const HistoryCard: React.FC<{ item: InterviewHistory }> = ({ item }) => {
    const [isOpen, setIsOpen] = useState(false);

    const typeDetails = {
        aptitude: { icon: <IconCalculator />, color: '#588157', title: 'Aptitude Quiz' },
        technical: { icon: <IconCode />, color: '#BC6C25', title: 'Technical Interview' },
        hr: { icon: <IconUsers />, color: '#588157', title: 'HR Interview' },
        group_discussion: { icon: <IconChat />, color: '#815c3c', title: 'Group Discussion' },
        profile_review: { icon: <IconDocument />, color: '#A3B18A', title: 'Profile Review' },
        mock: { icon: <IconBriefcase />, color: '#4f46e5', title: 'Mock Interview' },
        review_hub: { icon: <IconBookmark />, color: '#6c757d', title: 'Review Hub Activity' },
    };

    const details = typeDetails[item.type] || { icon: '?', color: '#6c757d', title: 'Session' };
    
    // Check if a full report is available in the dataReference
    const fullReport = (item.dataReference as any)?.fullReport;

    return (
        <div className="bg-white/60 backdrop-blur-xl rounded-xl shadow-lg border border-white/30 overflow-hidden transition-all duration-300">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full text-left p-4 flex items-center justify-between hover:bg-black/5">
                <div className="flex items-center">
                    <span className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: details.color }}>{details.icon}</span>
                    <div className="ml-4">
                        <h3 className="font-bold text-on-surface">{details.title}</h3>
                        <p className="text-sm text-on-secondary">{formatDate(item.timestamp)}</p>
                    </div>
                </div>
                <div className="flex items-center ml-4">
                    <p className="text-on-secondary mr-4 text-sm font-semibold text-right hidden md:block truncate max-w-xs">{item.summary}</p>
                    <svg className={`w-5 h-5 transform transition-transform text-on-secondary ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>
            {isOpen && (
                <div className="p-4 border-t border-white/30 bg-black/5 animate-fade-in">
                    {fullReport ? (
                        <div className="bg-slate-100 p-4 rounded-lg">
                            <SimpleMarkdown text={fullReport} />
                        </div>
                    ) : (
                        <>
                            <p className="font-bold mb-2 text-on-surface">Session Data:</p>
                            <div className="text-sm bg-slate-100 p-3 rounded-lg overflow-x-auto text-on-secondary">
                                <pre><code>{JSON.stringify(item.dataReference, null, 2)}</code></pre>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const HistoryView: React.FC<{ user: User }> = ({ user }) => {
    const [history, setHistory] = useState<InterviewHistory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const data = await getInterviewHistory(user.uid);
                setHistory(data);
            } catch (e) {
                setError("Could not load your history. Please try again later.");
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchHistory();
    }, [user.uid]);

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in">
            <header className="mb-8">
                <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Session History</h2>
                <p className="text-on-secondary mt-2">Review your past practice sessions and performance.</p>
            </header>
            
            {isLoading && <div className="text-center p-8"><Spinner /><p className="mt-4 text-on-secondary">Loading your session history...</p></div>}
            {error && <p className="text-red-500 my-4 text-center">{error}</p>}
            
            {!isLoading && !error && (
                history.length > 0 ? (
                    <div className="space-y-4">
                        {history.map(item => (
                            <HistoryCard key={item.id} item={item} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center p-12 bg-white/60 backdrop-blur-xl rounded-2xl">
                        <p className="text-on-secondary font-semibold text-lg">No History Yet</p>
                        <p className="text-on-secondary mt-2">Complete a practice session and it will appear here.</p>
                    </div>
                )
            )}
        </div>
    );
};

export default HistoryView;