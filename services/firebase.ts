import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Import the functions you need from the SDKs you need
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCqLgR5TM3UUOW8M6ymoO2e3LL6NJM8CQE",
    authDomain: "interview-ai-prep-f9593.firebase.com",
    projectId: "interview-ai-prep-f9593",
    storageBucket: "interview-ai-prep-f9593.firebasestorage.app",
    messagingSenderId: "1074004913915",
    appId: "1:1074004913915:web:05d3288b6cd526fa22ca5e",
    measurementId: "G-8S0BMV0Y66"
};

// Initialize Firebase, checking if it's already initialized to prevent errors during hot-reloads.
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);