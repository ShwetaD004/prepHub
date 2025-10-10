import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { RevisionQuestion, InterviewHistory } from '../types';
import { getRevisionQuestions, untagQuestionForRevision, saveInterviewHistory } from '../services/firestoreService';
import Spinner from './shared/Spinner';
import Card from './shared/Card';

const SimpleMarkdown: React.FC<{ text: string }> = ({ text }) => {
    const formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="bg-slate-200 text-primary-dark font-mono px-1.5 py-0.5 rounded-md">$1</code>')
        .replace(/\n/g, '<br />');

    return <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: formattedText }} />;
};

const RevisionQuestionCard: React.FC<{
    item: RevisionQuestion;
    onRemove: (id: string) => void;
    user: User;
}> = ({ item, onRemove, user }) => {
    const [isRemoving, setIsRemoving] = useState(false);

    const handleRemove = async () => {
        setIsRemoving(true);
        try {
            await untagQuestionForRevision(user.uid, item.id!);
             const historyData: Omit<InterviewHistory, 'id'|'userId'|'timestamp'> = {
                type: 'review_hub',
                sessionId: new Date().toISOString(),
                summary: `Removed 1 item from Review Hub.`,
                dataReference: { reviewItemsRemoved: 1 }
            };
            await saveInterviewHistory(user.uid, historyData);
            onRemove(item.id!);
        } catch (e) {
            console.error("Failed to remove question", e);
            setIsRemoving(false);
        }
    }

    return (
        <Card className="mb-4">
            <div className="flex justify-between items-start">
                 <p className="font-semibold text-on-surface flex-grow pr-4">{item.question.subTopic} | <span className="text-on-secondary font-normal">{item.quizTopic}</span></p>
                 <button 
                    onClick={handleRemove}
                    disabled={isRemoving}
                    className="flex-shrink-0 text-sm flex items-center text-red-600 bg-red-100 hover:bg-red-200 font-semibold py-1 px-3 rounded-full transition"
                    >
                    {isRemoving ? <Spinner size="sm"/> : <>
                        <IconTrash /> <span className="ml-1">Remove</span>
                    </>}
                </button>
            </div>
            <p className="font-semibold text-on-surface mt-2"><SimpleMarkdown text={item.question.question} /></p>
            <div className="mt-4 pt-3 border-t border-slate-300/50">
                <p className="font-semibold text-sm text-slate-600 mb-2">Explanation:</p>
                <div className="text-slate-700 text-sm leading-relaxed"><SimpleMarkdown text={item.question.explanation} /></div>
            </div>
             <p className="font-semibold text-sm text-primary-dark mt-3">Correct answer: {item.question.correctAnswer}</p>
        </Card>
    );
};


const ReviewHub: React.FC<{ user: User }> = ({ user }) => {
    const [questions, setQuestions] = useState<RevisionQuestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchQuestions = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const fetchedQuestions = await getRevisionQuestions(user.uid);
            setQuestions(fetchedQuestions);
        } catch (e) {
            setError("Could not load your revision questions. Please try again later.");
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [user.uid]);

    useEffect(() => {
        fetchQuestions();
    }, [fetchQuestions]);

    const handleRemoveQuestion = (id: string) => {
        setQuestions(prev => prev.filter(q => q.id !== id));
    };

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in">
            <header className="mb-8">
                <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Review Hub</h2>
                <p className="text-on-secondary mt-2">Here are all the questions you've tagged for revision. Master them!</p>
            </header>
            
            {isLoading && <div className="text-center p-8"><Spinner /><p className="mt-4 text-on-secondary">Loading your tagged questions...</p></div>}
            {error && <p className="text-red-500 my-4 text-center">{error}</p>}
            
            {!isLoading && !error && (
                questions.length > 0 ? (
                    <div>
                        {questions.map(item => (
                            <RevisionQuestionCard key={item.id} item={item} onRemove={handleRemoveQuestion} user={user} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center p-12 bg-white/60 backdrop-blur-xl rounded-2xl">
                         <IconBookmarkEmpty />
                        <p className="text-on-secondary mt-4 font-semibold text-lg">Your Review Hub is Empty</p>
                        <p className="text-on-secondary mt-2">Tag questions after a quiz to add them here for later practice.</p>
                    </div>
                )
            )}
        </div>
    );
};

const IconTrash = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const IconBookmarkEmpty = () => (
    <svg className="w-16 h-16 text-slate-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
);

export default ReviewHub;