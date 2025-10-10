import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { AptitudeTopic, AptitudeSubTopics, AptitudeQuestion, AptitudeQuizResult, RevisionQuestion, Feature, InterviewHistory, AptitudeDataReference } from '../types';
import { generateAptitudeQuestions, generateImprovementSuggestions } from '../services/geminiService';
import { saveInterviewHistory, hasUserCompletedDiagnostic, getRevisionQuestions, tagQuestionForRevision, untagQuestionForRevision } from '../services/firestoreService';
import Card from './shared/Card';
import Spinner from './shared/Spinner';
import ConfirmationModal from './shared/ConfirmationModal';

const LOCAL_STORAGE_KEY = 'aptitudeQuizInProgress';

interface SavedQuizState {
    questions: AptitudeQuestion[];
    userAnswers: (string | null)[];
    currentQuestionIndex: number;
    timeLeft: number | null;
    topic: string;
    selectedDifficulty: 'Easy' | 'Medium' | 'Hard' | 'Mixed';
    numQuestions: number;
    timePerQuestion: number[];
}


const SimpleMarkdown: React.FC<{ text: string }> = ({ text }) => {
    const formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="bg-slate-200 text-primary-dark font-mono px-1.5 py-0.5 rounded-md">$1</code>')
        .replace(/\n/g, '<br />');

    return <div className="prose" dangerouslySetInnerHTML={{ __html: formattedText }} />;
};

const CircularProgress: React.FC<{ percentage: number, sqSize?: number, strokeWidth?: number }> = ({ percentage, sqSize = 180, strokeWidth = 15 }) => {
    const radius = (sqSize - strokeWidth) / 2;
    const viewBox = `0 0 ${sqSize} ${sqSize}`;
    const dashArray = radius * Math.PI * 2;
    const dashOffset = dashArray - (dashArray * percentage) / 100;
    
    const scoreColor = percentage >= 70 ? 'text-primary' : percentage >= 40 ? 'text-yellow-500' : 'text-red-500';
    const trackColor = percentage >= 70 ? 'stroke-primary/20' : percentage >= 40 ? 'stroke-yellow-500/20' : 'stroke-red-500/20';
    const progressColor = percentage >= 70 ? 'stroke-primary' : percentage >= 40 ? 'stroke-yellow-500' : 'stroke-red-500';

    return (
        <div className="relative flex items-center justify-center" style={{ width: sqSize, height: sqSize }}>
            <svg width={sqSize} height={sqSize} viewBox={viewBox}>
                <circle className={trackColor} cx={sqSize / 2} cy={sqSize / 2} r={radius} strokeWidth={`${strokeWidth}px`} fill="none" />
                <circle
                    className={`${progressColor} transition-all duration-1000 ease-out`}
                    cx={sqSize / 2}
                    cy={sqSize / 2}
                    r={radius}
                    strokeWidth={`${strokeWidth}px`}
                    transform={`rotate(-90 ${sqSize / 2} ${sqSize / 2})`}
                    fill="none"
                    strokeLinecap="round"
                    style={{ strokeDasharray: dashArray, strokeDashoffset: dashOffset }}
                />
            </svg>
            <span className={`absolute ${sqSize > 100 ? 'text-5xl' : 'text-2xl'} font-extrabold ${scoreColor}`}>{percentage.toFixed(0)}<span className={sqSize > 100 ? 'text-3xl' : 'text-lg'}>%</span></span>
        </div>
    );
};

interface AptitudePrepProps {
  setIsQuizActive: (isActive: boolean) => void;
  user: User;
  onNavigate: (feature: Feature) => void;
}

const AptitudePrep: React.FC<AptitudePrepProps> = ({ setIsQuizActive, user, onNavigate }) => {
  const [flow, setFlow] = useState<'loading' | 'prompt' | 'setup' | 'active' | 'results'>('loading');
  
  const [selectedSubTopics, setSelectedSubTopics] = useState<string[]>([]);
  const [selectedDifficulty, setSelectedDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Mixed'>('Medium');
  const [numQuestions, setNumQuestions] = useState<number>(5);
  const [savedQuizState, setSavedQuizState] = useState<SavedQuizState | null>(null);

  const [questions, setQuestions] = useState<AptitudeQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<(string | null)[]>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timePerQuestion, setTimePerQuestion] = useState<number[]>([]);
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [quizTopic, setQuizTopic] = useState<string>('');
  const [quizType, setQuizType] = useState<'Practice' | 'Diagnostic'>('Practice');
  const [isStopModalOpen, setIsStopModalOpen] = useState(false);
  
  const [result, setResult] = useState<AptitudeQuizResult | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkDiagnosticStatus = async () => {
      try {
        const savedQuizJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedQuizJSON) {
          const savedQuiz: SavedQuizState = JSON.parse(savedQuizJSON);
          setSavedQuizState(savedQuiz);
          setFlow('setup'); // Always show setup if there's a saved quiz
        } else {
          const hasCompleted = await hasUserCompletedDiagnostic(user.uid);
          setFlow(hasCompleted ? 'setup' : 'prompt');
        }
      } catch (e) {
        console.error("Failed to check diagnostic status", e);
        setFlow('setup'); // Fallback to setup on error
      }
    };
    checkDiagnosticStatus();
  }, [user.uid]);

  useEffect(() => {
    const saveQuizProgress = () => {
      if (flow === 'active' && questions.length > 0) {
        const timeSpent = (Date.now() - questionStartTime) / 1000;
        const newTimes = [...timePerQuestion];
        newTimes[currentQuestionIndex] = (newTimes[currentQuestionIndex] || 0) + timeSpent;

        const quizToSave: SavedQuizState = {
          questions,
          userAnswers,
          currentQuestionIndex,
          timeLeft,
          topic: quizTopic,
          selectedDifficulty,
          numQuestions,
          timePerQuestion: newTimes,
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(quizToSave));
      }
    };

    window.addEventListener('beforeunload', saveQuizProgress);
    return () => {
      window.removeEventListener('beforeunload', saveQuizProgress);
      saveQuizProgress();
    };
  }, [flow, questions, userAnswers, currentQuestionIndex, timeLeft, quizTopic, selectedDifficulty, numQuestions, timePerQuestion, questionStartTime]);

  useEffect(() => {
    if (flow === 'active' && timeLeft !== null && timeLeft > 0) {
      const timerId = setInterval(() => {
        setTimeLeft(prevTime => (prevTime ? prevTime - 1 : 0));
      }, 1000);
      return () => clearInterval(timerId);
    } else if (flow === 'active' && timeLeft === 0) {
      handleNextQuestion(true); // Force submit
    }
  }, [flow, timeLeft]);

  const startQuiz = async (type: 'Practice' | 'Diagnostic', subTopics: string[], count: number, difficulty: 'Easy' | 'Medium' | 'Hard' | 'Mixed') => {
    setQuizType(type);
    
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setSavedQuizState(null);
    setIsLoading(true);
    setError(null);
    setResult(null);
    setIsQuizActive(true);

    let newQuizTopic = 'Aptitude Test';
    if (type === 'Diagnostic') {
        newQuizTopic = 'Diagnostic Test';
    } else {
        const subTopicToTopicMap: Record<string, AptitudeTopic> = {};
        for (const topic in AptitudeSubTopics) {
            AptitudeSubTopics[topic as AptitudeTopic].forEach(sub => { subTopicToTopicMap[sub] = topic as AptitudeTopic; });
        }
        const mainTopics = new Set<AptitudeTopic>();
        subTopics.forEach(sub => { if(subTopicToTopicMap[sub]) mainTopics.add(subTopicToTopicMap[sub]) });
        const mainTopicsArray = Array.from(mainTopics);
        newQuizTopic = mainTopicsArray.length > 1 ? "Mixed Topics" : mainTopicsArray[0] || "Aptitude Test";
    }
    setQuizTopic(newQuizTopic);

    try {
      const fetchedQuestions = await generateAptitudeQuestions(subTopics, count, difficulty);
      if (fetchedQuestions && fetchedQuestions.length > 0) {
        setQuestions(fetchedQuestions);
        setCurrentQuestionIndex(0);
        setUserAnswers(new Array(fetchedQuestions.length).fill(null));
        setTimePerQuestion(new Array(fetchedQuestions.length).fill(0));
        setQuestionStartTime(Date.now());

        if (type === 'Diagnostic') {
            setTimeLeft(40 * 60); // 40 minutes in seconds
        } else {
            const timePerQuestionVal = difficulty === 'Easy' ? 75 : difficulty === 'Medium' ? 90 : 120;
            setTimeLeft(fetchedQuestions.length * timePerQuestionVal);
        }

        setFlow('active');
      } else {
        setError('Could not fetch questions. Please try again.');
        setIsQuizActive(false);
        setFlow('setup');
      }
    } catch (err) {
      setError('An error occurred while fetching questions. Please check your API key and network connection.');
      console.error(err);
      setIsQuizActive(false);
      setFlow('setup');
    }
    setIsLoading(false);
  };

  const handleStartPractice = () => {
    const effectiveSubTopics = selectedSubTopics.filter(t => t !== 'All Topics');
    if (effectiveSubTopics.length === 0) {
        setError("Please select at least one sub-topic to start the quiz.");
        return;
    }
    startQuiz('Practice', effectiveSubTopics, numQuestions, selectedDifficulty);
  };
  
  const handleStartDiagnostic = () => {
    const allSubTopics = Object.values(AptitudeSubTopics).flat().filter(topic => topic !== 'All Topics');
    startQuiz('Diagnostic', allSubTopics, 30, 'Mixed');
  };

    const handleResumeQuiz = () => {
        if (savedQuizState) {
            setQuestions(savedQuizState.questions);
            setUserAnswers(savedQuizState.userAnswers);
            setCurrentQuestionIndex(savedQuizState.currentQuestionIndex);
            setTimeLeft(savedQuizState.timeLeft);
            setQuizTopic(savedQuizState.topic);
            setSelectedDifficulty(savedQuizState.selectedDifficulty);
            setNumQuestions(savedQuizState.numQuestions);
            setTimePerQuestion(savedQuizState.timePerQuestion);
            setQuestionStartTime(Date.now());
            
            setFlow('active');
            setIsQuizActive(true);
            setSavedQuizState(null);
        }
    };

  const handleAnswer = (answer: string) => {
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = answer;
    setUserAnswers(newAnswers);
  };
  
  const recordTime = () => {
    const timeSpent = (Date.now() - questionStartTime) / 1000;
    const newTimes = [...timePerQuestion];
    newTimes[currentQuestionIndex] = (newTimes[currentQuestionIndex] || 0) + timeSpent;
    setTimePerQuestion(newTimes);
    setQuestionStartTime(Date.now());
  };

  const handleNextQuestion = (forceSubmit = false) => {
    recordTime();
    if (!forceSubmit && currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      setTimeLeft(0);
      calculateResult(userAnswers, timePerQuestion);
      setFlow('results');
    }
  };
  
  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      recordTime();
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  }
  
  const handleSubTopicChange = (subTopic: string, category: AptitudeTopic, isChecked: boolean) => {
      const categorySubTopics = AptitudeSubTopics[category];

      if (subTopic === 'All Topics') {
          const otherSelected = selectedSubTopics.filter(t => !categorySubTopics.includes(t));
          if (isChecked) {
              setSelectedSubTopics([...otherSelected, ...categorySubTopics]);
          } else {
              setSelectedSubTopics(otherSelected);
          }
      } else {
          let newSelection = [...selectedSubTopics];
          if (isChecked) {
              newSelection.push(subTopic);
          } else {
              newSelection = newSelection.filter(t => t !== subTopic && t !== 'All Topics');
          }
          setSelectedSubTopics(newSelection);
      }
  };
  
  const calculateResult = async (finalAnswers: (string | null)[], finalTimes: number[]) => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setSavedQuizState(null);

    let correct = 0;
    questions.forEach((q, index) => {
      if (q.correctAnswer === finalAnswers[index]) {
        correct++;
      }
    });

    const quizResultData: AptitudeQuizResult = {
      userId: user.uid,
      score: (correct / questions.length) * 100,
      total: questions.length,
      correctAnswers: correct,
      incorrectAnswers: questions.length - correct,
      topic: quizTopic,
      difficulty: selectedDifficulty,
      type: 'Aptitude',
      quizType: quizType,
      questions,
      userAnswers: finalAnswers,
      timePerQuestion: finalTimes,
      timestamp: null, // This will be set on the server
    };
    
    setResult(quizResultData);

    try {
        const historyData: Omit<InterviewHistory, 'id'|'userId'|'timestamp'> = {
            type: 'aptitude',
            sessionId: new Date().toISOString(),
            durationSeconds: finalTimes.reduce((a,b) => a + b, 0),
            scoreRating: quizResultData.score,
            summary: `Completed a ${quizResultData.difficulty} ${quizResultData.topic} quiz, scoring ${quizResultData.correctAnswers}/${quizResultData.total}.`,
            dataReference: {
                topic: quizResultData.topic,
                difficulty: quizResultData.difficulty,
                quizType: quizResultData.quizType,
                questionsAnswered: quizResultData.total,
                qAndA_list: quizResultData.questions.map((q, i) => ({
                    question: q.question,
                    answer: quizResultData.userAnswers[i] || "Not Answered",
                    feedback_summary: q.correctAnswer === quizResultData.userAnswers[i] ? "Correct" : `Incorrect. Correct answer was ${q.correctAnswer}.`
                }))
            }
        };
        await saveInterviewHistory(user.uid, historyData);
    } catch (e) {
        console.error("Failed to save results to Firestore", e);
    }

    setIsQuizActive(false);

    if (quizResultData.score < 40) setSelectedDifficulty('Easy');
    else if (quizResultData.score > 80) setSelectedDifficulty('Hard');
    else setSelectedDifficulty('Medium');
  };

  const resetQuiz = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setSavedQuizState(null);
    setFlow('loading');
    setQuestions([]);
    setResult(null);
    setError(null);
    setSelectedSubTopics([]);
    setIsQuizActive(false);
    
    const check = async () => {
        const hasCompleted = await hasUserCompletedDiagnostic(user.uid);
        setFlow(hasCompleted ? 'setup' : 'prompt');
    };
    check();
  }

  const handleStopQuiz = () => {
    setIsStopModalOpen(true);
  };

  const confirmStopQuiz = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setIsStopModalOpen(false);
    onNavigate(Feature.DASHBOARD);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (isLoading || flow === 'loading') {
    return <div className="flex flex-col items-center justify-center min-h-screen"><Spinner /><p className="mt-4 text-on-secondary">Generating your personalized quiz...</p></div>;
  }
  if (error) {
    return <div className="text-center p-8"><p className="text-red-500 font-semibold">{error}</p><button onClick={resetQuiz} className="mt-4 bg-gradient-to-r from-primary to-secondary text-white font-bold py-2 px-6 rounded-lg">Try Again</button></div>;
  }

  switch (flow) {
    case 'prompt':
      return <DiagnosticPrompt onStart={handleStartDiagnostic} onSkip={() => setFlow('setup')} />;
    case 'active':
      const currentQuestion = questions[currentQuestionIndex];
      const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
      return (
        <div className="flex items-center justify-center min-h-screen p-4">
            <ConfirmationModal
                isOpen={isStopModalOpen}
                onClose={() => setIsStopModalOpen(false)}
                onConfirm={confirmStopQuiz}
                title="Don't Give Up Now!"
                message="Every question you answer sharpens your mind and brings you one step closer to your dream job. You're building great momentum. Are you sure you want to stop now?"
                confirmText="Yes, Stop Quiz"
                cancelText="Keep Going!"
            />
            <Card className="w-full max-w-3xl mx-auto my-8 animate-slide-in-up relative">
                <div className="absolute top-4 left-0 right-0 px-6 h-10 flex justify-center items-center">
                    {/* Timer */}
                    <div className="text-lg font-semibold text-red-600 bg-red-100 px-3 py-1 rounded-full shadow-sm">
                        {timeLeft !== null ? formatTime(timeLeft) : '0:00'}
                    </div>
                    {/* Dashboard Button */}
                    <div className="absolute top-0 right-6">
                        <button onClick={handleStopQuiz} className="text-sm text-primary hover:text-primary-dark font-semibold flex items-center bg-white hover:bg-primary/10 border-2 border-slate-200 hover:border-primary/20 px-3 py-1.5 rounded-full transition-colors shadow-sm">
                            <IconHome />
                            <span className="ml-1">Dashboard</span>
                        </button>
                    </div>
                </div>

                <div className="pt-12">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">{quizTopic}</h2>
                         <span className="font-semibold text-on-secondary text-lg">
                            {currentQuestionIndex + 1} / {questions.length}
                        </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5">
                        <div className="bg-gradient-to-r from-primary to-secondary h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
                <p className="text-xl text-on-surface my-6 min-h-[6rem] font-medium">{currentQuestionIndex + 1}. <SimpleMarkdown text={currentQuestion.question} /></p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentQuestion.options.map((option, index) => {
                        const isSelected = userAnswers[currentQuestionIndex] === option;
                        return (
                            <button key={index} onClick={() => handleAnswer(option)}
                                className={`p-4 rounded-lg text-left transition-all duration-300 border-2 text-on-surface ${isSelected ? 'bg-primary/20 border-primary shadow-inner scale-105' : 'bg-white/50 hover:bg-primary/10 border-slate-200'}`}>
                                {option}
                            </button>
                        );
                    })}
                </div>
                <div className="mt-8 flex justify-between items-center">
                    <button onClick={handlePreviousQuestion} disabled={currentQuestionIndex === 0}
                      className="bg-slate-200 text-on-secondary font-semibold py-2 px-8 rounded-lg hover:bg-slate-300 transition disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed">
                      Previous
                  </button>
                  <button onClick={() => handleNextQuestion()} disabled={!userAnswers[currentQuestionIndex]}
                      className="bg-gradient-to-r from-primary to-secondary text-white font-bold py-2 px-8 rounded-lg hover:shadow-lg transform hover:scale-105 transition disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none disabled:scale-100 disabled:cursor-not-allowed">
                      {currentQuestionIndex < questions.length - 1 ? 'Next' : 'Submit'}
                  </button>
                </div>
            </Card>
        </div>
      );
    case 'results':
      if (!result) return null;
      return <QuizResults result={result} resetQuiz={resetQuiz} user={user} onNavigate={onNavigate} />;
    case 'setup':
    default:
      return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto animate-fade-in">
            <Card>
                <h2 className="text-3xl font-bold text-on-surface text-center mb-6">Setup Your Aptitude Quiz</h2>

                {savedQuizState && (
                    <div className="mb-6 p-4 bg-primary/10 rounded-xl text-center border-2 border-dashed border-primary/30">
                        <p className="font-bold text-lg text-primary">You have an unfinished quiz!</p>
                        <p className="text-sm text-on-secondary mb-3">{savedQuizState.topic} - {savedQuizState.numQuestions} Questions</p>
                        <button 
                            onClick={handleResumeQuiz} 
                            className="bg-primary text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-dark transition-all duration-300 transform hover:scale-105"
                        >
                            Resume Test
                        </button>
                    </div>
                )}

                 <div className="mb-6 space-y-3">
                    <label className="block text-lg font-semibold text-on-secondary">1. Select Sub-Topics</label>
                    <div className="space-y-6">
                       {Object.entries(AptitudeSubTopics).map(([topic, subTopicsList]) => {
                         const category = topic as AptitudeTopic;
                         return (
                            <div key={topic} className="p-4 rounded-lg bg-slate-50/50 border">
                                <h3 className="font-semibold text-on-surface mb-3 border-b pb-2 text-lg">{topic}</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {subTopicsList.map(subTopic => (
                                        <label key={subTopic} className={`flex items-center space-x-2 cursor-pointer p-3 rounded-lg transition-colors ${selectedSubTopics.includes(subTopic) ? 'bg-primary/10' : 'bg-slate-100/50'}`}>
                                            <input type="checkbox"
                                              checked={selectedSubTopics.includes(subTopic)}
                                              onChange={(e) => handleSubTopicChange(subTopic, category, e.target.checked)}
                                              className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary-dark"
                                            />
                                            <span className="text-on-surface">{subTopic}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                         );
                        })}
                    </div>
                </div>

                <div className="mb-6 space-y-3">
                    <label className="block text-lg font-semibold text-on-secondary">2. Select Difficulty</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(['Easy', 'Medium', 'Hard', 'Mixed'] as const).map(d => (
                            <button key={d} onClick={() => setSelectedDifficulty(d)}
                                className={`p-3 rounded-lg border-2 font-medium transition-all duration-300 ${selectedDifficulty === d ? 'bg-primary text-white border-primary-dark scale-105 shadow-lg' : 'bg-white/50 hover:bg-primary/10'}`}>
                                {d}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="mb-8 space-y-3">
                    <label htmlFor="numQuestions" className="block text-lg font-semibold text-on-secondary">3. Number of Questions</label>
                    <input id="numQuestions" type="number" min="1" max="50" value={numQuestions} 
                        onChange={e => setNumQuestions(Math.max(1, Math.min(50, Number(e.target.value))))}
                        className="w-full p-3 rounded-lg border-2 bg-white/50 focus:ring-2 focus:ring-primary-dark focus:border-transparent font-medium" />
                </div>
                
                <button onClick={handleStartPractice} className="w-full bg-gradient-to-r from-primary to-secondary text-white font-bold py-4 rounded-lg text-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300">
                    {savedQuizState ? 'Start New Quiz' : 'Start Quiz'}
                </button>
            </Card>
        </div>
      );
  }
};

const DiagnosticPrompt: React.FC<{ onStart: () => void, onSkip: () => void }> = ({ onStart, onSkip }) => (
    <div className="p-4 md:p-8 max-w-2xl mx-auto animate-fade-in flex flex-col items-center justify-center min-h-[80vh]">
        <Card className="text-center">
            <h2 className="text-3xl font-bold text-on-surface mb-4">Take Your Diagnostic Test</h2>
            <p className="text-on-secondary mb-6">
                Let's start with a comprehensive test to pinpoint your strengths and weaknesses. This will help create a personalized preparation plan for you.
            </p>
            <div className="bg-primary/10 p-4 rounded-lg mb-8 text-left grid grid-cols-2 gap-4 text-sm sm:text-base">
                <div><strong><span className="text-primary">&#9201;</span> Duration:</strong> ~45 Minutes</div>
                <div><strong><span className="text-primary">&#10004;</span> Questions:</strong> 30</div>
                <div><strong><span className="text-primary">&#128200;</span> Difficulty:</strong> Mixed</div>
                <div><strong><span className="text-primary">&#128218;</span> Topics:</strong> All</div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onClick={onStart} className="w-full sm:w-auto bg-gradient-to-r from-primary to-secondary text-white font-bold py-3 px-8 rounded-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300">
                    Start Diagnostic Test
                </button>
                <button onClick={onSkip} className="w-full sm:w-auto text-on-secondary font-semibold py-3 px-6 hover:text-primary transition">
                    Skip for now
                </button>
            </div>
        </Card>
    </div>
);


// --- Results Components ---
const QuizResults: React.FC<{ result: AptitudeQuizResult, resetQuiz: () => void, user: User, onNavigate: (feature: Feature) => void }> = ({ result, resetQuiz, user, onNavigate }) => {
    const [showReview, setShowReview] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<string>('');
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [revisionQuestions, setRevisionQuestions] = useState<RevisionQuestion[]>([]);
    const [isTagging, setIsTagging] = useState<Record<number, boolean>>({});

    useEffect(() => {
        const fetchRevisionData = async () => {
            const questions = await getRevisionQuestions(user.uid);
            setRevisionQuestions(questions);
        };
        fetchRevisionData();
    }, [user.uid]);

    const getTaggedQuestionId = (question: AptitudeQuestion) => {
        return revisionQuestions.find(rq => rq.question.question === question.question)?.id;
    }

    const handleToggleRevisionTag = async (question: AptitudeQuestion, index: number) => {
        setIsTagging(prev => ({ ...prev, [index]: true }));
        const taggedId = getTaggedQuestionId(question);
        
        try {
            if (taggedId) {
                await untagQuestionForRevision(user.uid, taggedId);
                setRevisionQuestions(prev => prev.filter(rq => rq.id !== taggedId));
            } else {
                const newTaggedQuestion = await tagQuestionForRevision({
                    userId: user.uid,
                    question: question,
                    quizTopic: result.topic
                });
                setRevisionQuestions(prev => [...prev, newTaggedQuestion]);
            }
        } catch (e) {
            console.error("Failed to update revision tag", e);
        } finally {
            setIsTagging(prev => ({ ...prev, [index]: false }));
        }
    };

    const analysis = useMemo(() => {
        const { questions, userAnswers, timePerQuestion } = result;
        
        const subTopicStats: { [key: string]: { correct: number, total: number, times: number[] } } = {};
        questions.forEach((q, i) => {
            const topic = q.subTopic || 'General';
            if (!subTopicStats[topic]) {
                subTopicStats[topic] = { correct: 0, total: 0, times: [] };
            }
            if (userAnswers[i] === q.correctAnswer) {
                subTopicStats[topic].correct++;
            }
            subTopicStats[topic].total++;
            subTopicStats[topic].times.push(timePerQuestion[i] || 0);
        });

        const topicBreakdown = Object.entries(subTopicStats).map(([subTopic, stats]) => ({
            subTopic,
            ...stats,
            accuracy: (stats.correct / stats.total) * 100,
            avgTime: stats.times.reduce((a, b) => a + b, 0) / stats.times.length,
        }));

        const overallAvgTime = timePerQuestion.filter(t => t > 0).reduce((a, b) => a + b, 0) / timePerQuestion.filter(t => t > 0).length || 60;
        
        const speedAccuracy = { fastAccurate: [] as string[], slowAccurate: [] as string[], fastInaccurate: [] as string[], slowInaccurate: [] as string[] };
        topicBreakdown.forEach(topic => {
            if (topic.accuracy >= 60) {
                if (topic.avgTime <= overallAvgTime * 1.1) speedAccuracy.fastAccurate.push(topic.subTopic);
                else speedAccuracy.slowAccurate.push(topic.subTopic);
            } else {
                if (topic.avgTime <= overallAvgTime * 1.1) speedAccuracy.fastInaccurate.push(topic.subTopic);
                else speedAccuracy.slowInaccurate.push(topic.subTopic);
            }
        });
        
        const radarData = topicBreakdown.map(topic => ({ axis: topic.subTopic, value: topic.accuracy / 100 }));
        const suggestions = [...speedAccuracy.slowInaccurate, ...speedAccuracy.fastInaccurate, ...speedAccuracy.slowAccurate];

        return { topicBreakdown, speedAccuracy, radarData, suggestions };
    }, [result]);
    
    useEffect(() => {
        const getSuggestions = async () => {
            if (analysis.suggestions.length > 0) {
                setIsLoadingSuggestions(true);
                try {
                    const suggestions = await generateImprovementSuggestions({
                        slowInaccurate: analysis.speedAccuracy.slowInaccurate,
                        fastInaccurate: analysis.speedAccuracy.fastInaccurate,
                        slowAccurate: analysis.speedAccuracy.slowAccurate,
                    });
                    setAiSuggestions(suggestions);
                } catch (e) {
                    console.error("Failed to get AI suggestions", e);
                    setAiSuggestions("Could not load suggestions. Focus on topics in the 'Slow & Inaccurate' and 'Fast & Inaccurate' categories.");
                } finally {
                    setIsLoadingSuggestions(false);
                }
            }
        };
        getSuggestions();
    }, [analysis]);

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto animate-fade-in">
            <header className="text-center mb-8">
                <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Detailed Performance Analysis</h2>
                <p className="text-on-secondary mt-2">Here's a breakdown of your quiz results.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column */}
                <div className="lg:col-span-1 space-y-6">
                    <Card>
                        <h3 className="text-xl font-bold text-on-surface mb-4 text-center">Overall Score</h3>
                        <div className="flex justify-center">
                            <CircularProgress percentage={result.score} sqSize={150} strokeWidth={12} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-4 text-center text-sm">
                            <div><p className="font-bold text-lg">{result.total}</p><p className="text-on-secondary">Total</p></div>
                            <div className="text-green-700"><p className="font-bold text-lg">{result.correctAnswers}</p><p>Correct</p></div>
                            <div className="text-red-700"><p className="font-bold text-lg">{result.incorrectAnswers}</p><p>Incorrect</p></div>
                        </div>
                    </Card>
                    <Card>
                        <h3 className="text-xl font-bold text-on-surface mb-4">Personalized Suggestions</h3>
                        {isLoadingSuggestions ? (
                            <div className="flex justify-center items-center h-24">
                                <Spinner size="sm" />
                            </div>
                        ) : (
                            aiSuggestions ? (
                                <div className="text-sm text-on-surface space-y-2"><SimpleMarkdown text={aiSuggestions} /></div>
                            ) : (
                                <p className="text-on-secondary">Great job! No major areas for improvement found.</p>
                            )
                        )}
                    </Card>
                </div>

                {/* Right Column */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <h3 className="text-xl font-bold text-on-surface mb-4">Proficiency Snapshot</h3>
                        {analysis.radarData.length > 2 ? (
                            <RadarChart data={analysis.radarData} />
                        ) : (
                            <p className="text-on-secondary text-center py-8">Need at least 3 sub-topics for a proficiency snapshot.</p>
                        )}
                    </Card>
                    <Card>
                         <h3 className="text-xl font-bold text-on-surface mb-4">Speed vs. Accuracy Matrix</h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <Quadrant title="Fast & Accurate" topics={analysis.speedAccuracy.fastAccurate} color="primary" icon="🚀" description="Your Strengths" />
                            <Quadrant title="Slow & Accurate" topics={analysis.speedAccuracy.slowAccurate} color="yellow-500" icon="🐢" description="Needs Speed" />
                            <Quadrant title="Fast & Inaccurate" topics={analysis.speedAccuracy.fastInaccurate} color="orange-500" icon="🤔" description="Needs Caution" />
                            <Quadrant title="Slow & Inaccurate" topics={analysis.speedAccuracy.slowInaccurate} color="red-500" icon="📚" description="Needs Focus" />
                         </div>
                    </Card>
                </div>
            </div>
            
            <Card className="mt-6">
                <h3 className="text-xl font-bold text-on-surface mb-4">Topic-wise Breakdown</h3>
                <div className="space-y-4">
                    {analysis.topicBreakdown.map(topic => (
                        <div key={topic.subTopic}>
                            <div className="flex justify-between items-center mb-1 text-on-surface">
                                <span className="font-semibold">{topic.subTopic}</span>
                                <span className="text-sm font-bold">{topic.accuracy.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2.5">
                                <div className="bg-gradient-to-r from-secondary to-primary h-2.5 rounded-full" style={{ width: `${topic.accuracy}%` }}></div>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            <div className="text-center mt-8 space-x-4">
                <button onClick={() => onNavigate(Feature.DASHBOARD)} className="bg-on-surface text-white font-bold py-3 px-8 rounded-lg hover:bg-on-surface/80 transition-all">Back to Dashboard</button>
                <button onClick={resetQuiz} className="bg-gradient-to-r from-primary to-secondary text-white font-bold py-3 px-8 rounded-lg hover:shadow-lg transform hover:scale-105 transition-all">Take Another Quiz</button>
                <button onClick={() => setShowReview(s => !s)} className="bg-white text-on-surface font-bold py-3 px-8 rounded-lg border-2 hover:bg-slate-50 transition-all">
                    {showReview ? 'Hide' : 'Review'} Answers
                </button>
            </div>
            
            {showReview && (
                 <Card className="mt-6">
                    <h3 className="text-2xl font-bold text-on-surface mb-6 border-t pt-6">Review Your Answers</h3>
                    <div className="space-y-6">
                        {result.questions.map((q, index) => {
                            const userAnswer = result.userAnswers[index];
                            const isCorrect = q.correctAnswer === userAnswer;
                            const isTagged = !!getTaggedQuestionId(q);
                            return (
                                <div key={index} className={`p-4 rounded-lg border-l-4 ${isCorrect ? 'border-primary bg-primary/10' : 'border-red-500 bg-red-50'}`}>
                                    <div className="flex justify-between items-start">
                                        <p className="font-semibold text-on-surface flex-grow">{index + 1}. <SimpleMarkdown text={q.question} /></p>
                                        <button 
                                            onClick={() => handleToggleRevisionTag(q, index)} 
                                            disabled={isTagging[index]}
                                            className={`flex-shrink-0 ml-4 p-2 rounded-full transition-colors duration-200 ${isTagged ? 'text-primary bg-primary/20' : 'text-on-secondary hover:bg-slate-200'}`}
                                            aria-label={isTagged ? 'Remove from revision' : 'Tag for revision'}
                                        >
                                            {isTagging[index] ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"></div> : <IconBookmark isFilled={isTagged} />}
                                        </button>
                                    </div>
                                    <div className="mt-3 text-sm space-y-2">
                                        <p className={`font-medium ${isCorrect ? 'text-primary-dark' : 'text-red-800'}`}>Your answer: {userAnswer || 'Not Answered'} <span className={`ml-2 font-bold ${isCorrect ? 'text-primary' : 'text-red-500'}`}>{isCorrect ? '✓' : '✗'}</span></p>
                                        {!isCorrect && <p className="font-medium text-primary-dark">Correct answer: {q.correctAnswer}</p>}
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-slate-300/50">
                                        <p className="font-semibold text-sm text-slate-600 mb-2">Explanation:</p>
                                        <div className="text-slate-700 text-sm leading-relaxed"><SimpleMarkdown text={q.explanation} /></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </Card>
            )}

        </div>
    );
};

const Quadrant: React.FC<{title: string; topics: string[]; color: string; icon: string; description: string}> = ({ title, topics, color, icon, description }) => (
    <div className={`p-4 rounded-lg border-l-4`} style={{borderColor: `var(--tw-color-${color})`, backgroundColor: `var(--tw-color-${color}-50)`}}>
        <h4 className={`font-bold text-lg`} style={{color: `var(--tw-color-${color}-800)`}}>{icon} {title}</h4>
        <p className="text-xs text-on-secondary mb-2">{description}</p>
        {topics.length > 0 ? (
            <ul className="space-y-1">
                {topics.map(t => <li key={t} className="text-on-surface bg-white/50 px-2 py-1 rounded">{t}</li>)}
            </ul>
        ) : (
            <p className="text-on-secondary italic">None</p>
        )}
    </div>
);

const RadarChart: React.FC<{ data: { axis: string, value: number }[] }> = ({ data }) => {
    const size = 300;
    const center = size / 2;
    const radius = size * 0.4;
    const numLevels = 5;
    const angleSlice = (Math.PI * 2) / data.length;

    const levels = Array.from({ length: numLevels }, (_, i) => {
        const levelRadius = radius * ((i + 1) / numLevels);
        const points = data.map((_, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            const x = center + levelRadius * Math.cos(angle);
            const y = center + levelRadius * Math.sin(angle);
            return `${x},${y}`;
        }).join(' ');
        return <polygon key={i} points={points} className="stroke-slate-300 fill-none" />;
    });

    const axes = data.map((item, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        const x1 = center;
        const y1 = center;
        const x2 = center + radius * Math.cos(angle);
        const y2 = center + radius * Math.sin(angle);
        const labelX = center + (radius * 1.15) * Math.cos(angle);
        const labelY = center + (radius * 1.15) * Math.sin(angle);
        return (
            <g key={i}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-slate-300" />
                <text x={labelX} y={labelY} textAnchor="middle" alignmentBaseline="middle" className="text-xs fill-on-secondary font-medium">
                    {item.axis.length > 12 ? item.axis.slice(0,10)+'...' : item.axis}
                </text>
            </g>
        );
    });

    const dataPoints = data.map(item => {
        const valueRadius = radius * item.value;
        const angle = angleSlice * data.indexOf(item) - Math.PI / 2;
        const x = center + valueRadius * Math.cos(angle);
        const y = center + valueRadius * Math.sin(angle);
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="flex justify-center items-center">
            <svg viewBox={`0 0 ${size} ${size}`}>
                {levels}
                {axes}
                <polygon points={dataPoints} className="stroke-primary fill-primary/30" strokeWidth="2" />
            </svg>
        </div>
    );
};

const IconBookmark: React.FC<{isFilled: boolean}> = ({ isFilled }) => (
    <svg className="w-5 h-5" fill={isFilled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
);
const IconHome = () => <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;

export default AptitudePrep;