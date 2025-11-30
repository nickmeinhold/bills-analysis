// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD-OfDBnxIxQoUWhCIealTwgj2Xl6-qT-Q",
  authDomain: "debt-dashboard-project.firebaseapp.com",
  projectId: "debt-dashboard-project",
  storageBucket: "debt-dashboard-project.firebasestorage.app",
  messagingSenderId: "249385029848",
  appId: "1:249385029848:web:5f8b298b913470dcea87ad",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
