import React, { useState, useEffect, useMemo } from 'react';
import { auth } from './services/firebase';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';

import { Feature } from './types';
import Dashboard from './components/Dashboard';
import AptitudePrep from './components/AptitudePrep';
import TechnicalPrep from './components/TechnicalPrep';
import HrPrep from './components/HrPrep';
import GroupDiscussion from './components/GroupDiscussion';
import ProfileReview from './components/ProfileReview';
import HistoryView from './components/HistoryView';
import ReviewHub from './components/ReviewHub';
import MockInterview from './components/MockInterview';
import Spinner from './components/shared/Spinner';

// --- SVG Icons ---

const CheckCircleIcon = () => (
    <svg className="w-6 h-6 text-emerald-500 flex-shrink-0 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const EyeIcon = () => (
    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
);

const EyeOffIcon = () => (
    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7 1.274-4.057 5.064 7 9.542-7 .847 0 1.673.124 2.456.355M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 2l20 20" />
    </svg>
);

const Logo = ({ color = 'text-primary' }) => (
  <svg className={`w-10 h-10 ${color}`} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5-10-5-10 5zM12 14.5l-10-5V12l10 5 10-5V9.5l-10 5z" />
  </svg>
);

// --- Authentication Components ---

type AuthView = 'landing' | 'signIn' | 'signUp';

const LandingPage = ({ setView }: { setView: (view: AuthView) => void }) => {
    const features = [
        "Personalized AI-powered coaching",
        "Adaptive aptitude and technical tests",
        "Realistic HR and group discussion simulations",
        "Comprehensive resume and profile reviews",
    ];

    return (
        <div className="min-h-screen bg-neutral-50 flex flex-col justify-center items-center p-4">
            <main className="max-w-4xl text-center">
                <div className="flex justify-center items-center mb-4">
                    <Logo color="text-emerald-600" />
                    <h1 className="text-4xl font-bold ml-2 text-slate-800">PrepHub</h1>
                </div>
                <h2 className="text-4xl md:text-6xl font-extrabold text-slate-900 leading-tight">
                    The smartest way to prepare for your <span className="text-emerald-600">dream job interview</span>.
                </h2>
                <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto">
                    Stop guessing. Start preparing with an AI coach that gives you a real competitive edge. Ace every round, from aptitude to the final HR interview.
                </p>
                <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-left max-w-2xl mx-auto">
                    {features.map(feature => (
                        <li key={feature} className="flex items-center text-slate-700">
                            <CheckCircleIcon />
                            <span>{feature}</span>
                        </li>
                    ))}
                </ul>
                <div className="mt-10 flex flex-col sm:flex-row justify-center items-center gap-4">
                    <button onClick={() => setView('signUp')} className="w-full sm:w-auto bg-emerald-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-emerald-700 transition-transform transform hover:scale-105 shadow-lg">
                        Start Practicing Free
                    </button>
                </div>
            </main>
        </div>
    );
};

const AuthForm = ({ isLogin, setView }: { isLogin: boolean; setView: (view: AuthView) => void }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [errors, setErrors] = useState<{ [key: string]: string }>({});
    const [isLoading, setIsLoading] = useState(false);

    const isFormValid = useMemo(() => {
        if (!email || !password || Object.values(errors).some(e => e)) return false;
        if (!isLogin && !confirmPassword) return false;
        return true;
    }, [email, password, confirmPassword, errors, isLogin]);
    
    useEffect(() => {
        const newErrors: { [key: string]: string } = {};
        if (email && !/\S+@\S+\.\S+/.test(email)) {
            newErrors.email = 'Please enter a valid email address.';
        }
        if (password && password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters long.';
        }
        if (!isLogin && password && confirmPassword && password !== confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match.';
        }
        setErrors(newErrors);
    }, [email, password, confirmPassword, isLogin]);
    
    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isFormValid) return;

        setErrors({});
        setIsLoading(true);

        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
        } catch (err: any) {
            let friendlyError = 'An unexpected error occurred. Please try again.';
            switch (err.code) {
                case 'auth/invalid-email': friendlyError = 'Please enter a valid email address.'; break;
                case 'auth/user-not-found': friendlyError = 'No account found with this email. Please sign up.'; break;
                case 'auth/wrong-password': friendlyError = 'Incorrect password. Please try again.'; break;
                case 'auth/email-already-in-use': friendlyError = 'An account with this email already exists. Please sign in.'; break;
                case 'auth/weak-password': friendlyError = 'Password is too weak. Please use at least 6 characters.'; break;
            }
            setErrors({ firebase: friendlyError });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white p-8 md:p-10 rounded-3xl shadow-xl animate-fade-in">
                <button onClick={() => setView('landing')} className="text-slate-500 hover:text-slate-800 mb-4">&larr; Back to Home</button>
                <h2 className="text-3xl font-bold text-slate-800">{isLogin ? 'Welcome Back!' : 'Create Your Account'}</h2>
                <p className="text-slate-600 mt-2 mb-8">{isLogin ? 'Sign in to continue your journey.' : 'Get started with your prep.'}</p>

                <form onSubmit={handleAuth} noValidate>
                    {errors.firebase && <p className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-center text-sm">{errors.firebase}</p>}
                    <div className="mb-4">
                        <label className="block text-slate-700 font-semibold mb-2" htmlFor="email">Email Address</label>
                        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 ${errors.email ? 'border-red-500 ring-red-200' : 'border-slate-300 focus:ring-emerald-500'}`}
                            placeholder="you@example.com" required
                        />
                         {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
                    </div>
                    <div className="mb-4">
                        <label className="block text-slate-700 font-semibold mb-2" htmlFor="password">Password</label>
                         <div className="relative flex items-center">
                            <input id="password" type={passwordVisible ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 ${errors.password ? 'border-red-500 ring-red-200' : 'border-slate-300 focus:ring-emerald-500'}`}
                                placeholder="••••••••" required
                            />
                            <button type="button" onClick={() => setPasswordVisible(!passwordVisible)} className="absolute right-3">
                                {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </div>
                        {errors.password && <p className="text-red-600 text-sm mt-1">{errors.password}</p>}
                    </div>
                    {!isLogin && (
                        <div className="mb-6">
                            <label className="block text-slate-700 font-semibold mb-2" htmlFor="confirmPassword">Confirm Password</label>
                             <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 ${errors.confirmPassword ? 'border-red-500 ring-red-200' : 'border-slate-300 focus:ring-emerald-500'}`}
                                placeholder="••••••••" required
                            />
                             {errors.confirmPassword && <p className="text-red-600 text-sm mt-1">{errors.confirmPassword}</p>}
                        </div>
                    )}
                    <button type="submit" disabled={!isFormValid || isLoading}
                        className="w-full bg-emerald-600 text-white font-bold py-3 rounded-lg hover:bg-emerald-700 transition disabled:bg-emerald-300 disabled:cursor-not-allowed flex justify-center">
                        {isLoading ? <Spinner size="sm" /> : (isLogin ? 'Sign In' : 'Create Account')}
                    </button>
                </form>
                <p className="text-center text-slate-600 mt-6">
                    {isLogin ? "Don't have an account?" : 'Already have an account?'}
                    <button onClick={() => setView(isLogin ? 'signUp' : 'signIn')} className="text-emerald-600 font-semibold hover:underline ml-2">
                        {isLogin ? 'Sign Up' : 'Sign In'}
                    </button>
                </p>
            </div>
        </div>
    );
};


// --- Main Application Component (for authenticated users) ---
const IconHome = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
const IconCalculator = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
const IconCode = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>;
const IconUsers = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197" /></svg>;
const IconChat = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V4a2 2 0 012-2h6.586a1 1 0 01.707.293l2.414 2.414a1 1 0 01.293.707V8z" /></svg>;
const IconDocument = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
const IconBriefcase = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
const IconLogout = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;
const IconHistory = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconBookmark = () => <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>;

const MainApp = ({ user, handleLogout }: { user: User; handleLogout: () => void }) => {
    const [activeFeature, setActiveFeature] = useState<Feature>(Feature.DASHBOARD);
    const [isQuizActive, setIsQuizActive] = useState(false);

    const handleSetFeature = (feature: Feature) => {
        setIsQuizActive(false);
        setActiveFeature(feature);
    };

    const renderFeature = () => {
        switch (activeFeature) {
            case Feature.APTITUDE_PREP: return <AptitudePrep setIsQuizActive={setIsQuizActive} user={user} onNavigate={handleSetFeature} />;
            case Feature.TECHNICAL_PREP: return <TechnicalPrep setIsQuizActive={setIsQuizActive} user={user} onNavigate={handleSetFeature} />;
            case Feature.HR_PREP: return <HrPrep setIsQuizActive={setIsQuizActive} user={user} onNavigate={handleSetFeature} />;
            case Feature.GROUP_DISCUSSION: return <GroupDiscussion setIsQuizActive={setIsQuizActive} user={user} onNavigate={handleSetFeature} />;
            case Feature.PROFILE_REVIEW: return <ProfileReview user={user} onNavigate={handleSetFeature} />;
            case Feature.HISTORY: return <HistoryView user={user} />;
            case Feature.REVIEW_HUB: return <ReviewHub user={user} />;
            case Feature.MOCK_INTERVIEW: return <MockInterview setIsQuizActive={setIsQuizActive} user={user} onNavigate={handleSetFeature} />;
            case Feature.DASHBOARD: default: return <Dashboard onSelectFeature={handleSetFeature} user={user} />;
        }
    };

    const NavItem: React.FC<{ feature?: Feature; label: string; icon: React.ReactNode; onClick?: () => void; isButton?: boolean; }> = 
        ({ feature, label, icon, onClick, isButton = false }) => (
        <button
            onClick={() => (onClick ? onClick() : feature && handleSetFeature(feature))}
            className={`flex items-center w-full px-6 py-3 my-1 text-left transition-all duration-300 rounded-lg ${
                activeFeature === feature && !isButton
                ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg'
                : 'text-on-secondary hover:bg-black/5 hover:text-on-surface'
            }`}
        >
            {icon}
            <span className="ml-4 font-semibold">{label}</span>
        </button>
    );

    return (
        <div className="flex min-h-screen bg-background text-on-surface">
            {!isQuizActive && (
                <aside className="w-64 bg-surface shadow-md flex-shrink-0 flex-col hidden md:flex p-4">
                    <div className="p-4 mb-4 flex items-center justify-start">
                        <Logo />
                        <h1 className="text-2xl font-bold ml-2 text-on-surface">PrepHub</h1>
                    </div>
                    <nav className="flex-grow">
                        <NavItem feature={Feature.DASHBOARD} label="Dashboard" icon={<IconHome />} />
                        <NavItem feature={Feature.MOCK_INTERVIEW} label="Mock Interview" icon={<IconBriefcase />} />
                        <NavItem feature={Feature.APTITUDE_PREP} label="Aptitude" icon={<IconCalculator />} />
                        <NavItem feature={Feature.TECHNICAL_PREP} label="Technical" icon={<IconCode />} />
                        <NavItem feature={Feature.HR_PREP} label="HR" icon={<IconUsers />} />
                        <NavItem feature={Feature.GROUP_DISCUSSION} label="Group Discussion" icon={<IconChat />} />
                        <NavItem feature={Feature.PROFILE_REVIEW} label="Profile Review" icon={<IconDocument />} />
                        <NavItem feature={Feature.REVIEW_HUB} label="Review Hub" icon={<IconBookmark />} />
                        <NavItem feature={Feature.HISTORY} label="History" icon={<IconHistory />} />
                    </nav>
                    <div className="mt-auto">
                        <NavItem label="Sign Out" icon={<IconLogout />} onClick={handleLogout} isButton />
                    </div>
                </aside>
            )}
            <main className="flex-1 overflow-y-auto">
                {renderFeature()}
            </main>
        </div>
    );
};


// --- Root App Component ---

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);
    const [authView, setAuthView] = useState<AuthView>('landing');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setIsLoadingAuth(false);
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            setAuthView('landing');
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    if (isLoadingAuth) {
        return <div className="flex h-screen items-center justify-center"><Spinner size="lg" /></div>;
    }

    if (!user) {
        switch (authView) {
            case 'signIn':
                return <AuthForm isLogin={true} setView={setAuthView} />;
            case 'signUp':
                return <AuthForm isLogin={false} setView={setAuthView} />;
            case 'landing':
            default:
                return <LandingPage setView={setAuthView} />;
        }
    }

    return <MainApp user={user} handleLogout={handleLogout} />;
};

export default App;