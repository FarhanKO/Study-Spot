import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  getDocs,
  writeBatch
} from 'firebase/firestore';

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "project-dfb474d5-d13f-4fe2-ac4",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:805177540662:web:85bd01dcd188d3119b5897",
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDxBD0ERXYjlplelyUP7drVqGWtllxMKzA",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "project-dfb474d5-d13f-4fe2-ac4.firebaseapp.com",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "project-dfb474d5-d13f-4fe2-ac4.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "805177540662"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the specific database ID from configuration
export const db = getFirestore(app, import.meta.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-studyspot-25b059d3-2b70-41e0-8c27-fc2b0fa2d1f8");

// Helper to retrieve/generate persistent client-side userId
export const getUserId = (): string => {
  let id = localStorage.getItem('study_spot_user_id');
  if (!id) {
    id = 'user_' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('study_spot_user_id', id);
  }
  return id;
};

// Interface for DB CheckIn representation
export interface DbCheckIn {
  id: string; // matches userId (since 1 checkin max per user)
  userId: string;
  roomId: string;
  timestamp: number;
}

// Interface for DB Vote representation
export interface DbVote {
  id: string; // matches userId_roomId_category
  userId: string;
  roomId: string;
  category: 'crowd' | 'spec';
  value: string;
  timestamp: number;
}

// Save or clear user vote
export async function dbSaveVote(roomId: string, category: 'crowd' | 'spec', value: string | undefined): Promise<void> {
  const userId = getUserId();
  const id = `${userId}_${roomId}_${category}`;
  const voteDocRef = doc(db, 'votes', id);

  if (!value) {
    await deleteDoc(voteDocRef);
  } else {
    await setDoc(voteDocRef, {
      id,
      userId,
      roomId,
      category,
      value,
      timestamp: Date.now()
    });
  }
}

// Save or clear user check-in (checking in to a room automatically clears any previous check-in for this user)
export async function dbSaveCheckIn(roomId: string | null): Promise<void> {
  const userId = getUserId();
  const checkInDocRef = doc(db, 'checkins', userId);

  if (!roomId) {
    await deleteDoc(checkInDocRef);
  } else {
    await setDoc(checkInDocRef, {
      id: userId,
      userId,
      roomId,
      timestamp: Date.now()
    });
  }
}
