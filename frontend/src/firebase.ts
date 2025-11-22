// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBR3gToixn2EEBGqqXLKpP5ZcTwxYFrdQc",
  authDomain: "gen-lang-client-0390109521.firebaseapp.com",
  projectId: "gen-lang-client-0390109521",
  storageBucket: "gen-lang-client-0390109521.firebasestorage.app",
  messagingSenderId: "391238750818",
  appId: "1:391238750818:web:d454e69435d04e0c4fb73b",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
