import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const isMockConfig = firebaseConfig.apiKey === 'remixed-api-key';

let app: any;
let auth: any;
let googleProvider: any;
let db: any;

if (!isMockConfig) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    const databaseId = (firebaseConfig as any).firestoreDatabaseId;
    db = getFirestore(app, databaseId);
  } catch (e) {
    console.error("Firebase init error:", e);
  }
}

export { auth, googleProvider, db };
