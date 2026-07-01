
import {
  GoogleAuthProvider,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User, UserRole } from '../types';

// Define a shape for the user's profile stored in Firestore.
interface UserProfile {
  name: string;
  email: string;
  // Role is no longer stored here for authorization, but can be for display/info.
  role: UserRole; 
  createdAt?: unknown;
  updatedAt?: unknown;
}

const USERS_COLLECTION = 'users';

/**
 * Maps a Firebase User object to our application's User type.
 * Crucially, it now gets the user's role from the ID token (custom claims).
 */
const mapFirebaseUserToUser = async (fbUser: FirebaseUser): Promise<User | null> => {
  // Force a refresh of the token to get the latest custom claims.
  const idTokenResult = await fbUser.getIdTokenResult(true);
  const userRole = (idTokenResult.claims.role as UserRole) || UserRole.PATIENT;

  const ref = doc(db, USERS_COLLECTION, fbUser.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // This case might happen if an admin creates an account but doesn't set a profile yet.
    // We can create a default profile here or handle it as an error.
    console.warn('User profile not found in Firestore. Using default values.');
    return {
      id: fbUser.uid,
      name: fbUser.displayName || 'New User',
      email: fbUser.email || '',
      role: userRole, // Role from token is authoritative.
    };
  }

  const profile = snap.data() as UserProfile;

  return {
    id: fbUser.uid,
    name: profile.name || fbUser.displayName || 'User',
    email: profile.email || fbUser.email || '',
    role: userRole, // ALWAYS use the role from the secure token for application logic.
  };
};

/**
 * Creates or updates a user's profile in the Firestore database.
 */
const upsertProfile = async (
  uid: string,
  payload: Pick<UserProfile, 'name' | 'email' | 'role'>
): Promise<void> => {
  const ref = doc(db, USERS_COLLECTION, uid);
  await setDoc(
    ref,
    {
      ...payload,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(), // This will only be set on creation
    },
    { merge: true }
  );
};

/**
 * Gets the current authenticated user's profile.
 */
export const getCurrentUserProfile = async (): Promise<User | null> => {
  if (!auth.currentUser) return null;
  return mapFirebaseUserToUser(auth.currentUser);
};

/**
 * Signs in a user with email and password.
 * The role is determined by custom claims, not by a parameter.
 */
export const loginWithEmail = async (email: string, password: string): Promise<User> => {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const mappedUser = await mapFirebaseUserToUser(cred.user);

  if (!mappedUser) {
    await signOut(auth);
    throw new Error('Could not map user profile. Please contact an administrator.');
  }

  return mappedUser;
};

/**
 * Registers a new user with the default 'PATIENT' role.
 * An admin must later elevate their privileges.
 */
export const registerPatientWithEmail = async (
  name: string,
  email: string,
  password: string
): Promise<User> => {
  const cred = await createUserWithEmailAndPassword(auth, email, password);

  // When a user is created, their default role in Firestore is PATIENT.
  // A custom claim is NOT set here. Only an admin can do that.
  await upsertProfile(cred.user.uid, {
    name,
    email,
    role: UserRole.PATIENT, // Default role in the database document.
  });

  // Trigger verification email immediately after signup.
  await sendEmailVerification(cred.user);

  // Note: The user will not have a custom claim role until an admin sets it.
  return {
    id: cred.user.uid,
    name,
    email,
    role: UserRole.PATIENT, // The user's role is PATIENT by default.
  };
};

/**
 * Logs in a user via Google. Their role is determined by custom claims.
 */
export const loginWithGoogle = async (): Promise<User> => {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  const user = cred.user;

  // Check if a profile exists. If not, create one.
  const userDocRef = doc(db, USERS_COLLECTION, user.uid);
  const userDoc = await getDoc(userDocRef);

  if (!userDoc.exists()) {
    const name = user.displayName || 'Patient';
    const email = user.email || '';
    await upsertProfile(user.uid, {
      name,
      email,
      role: UserRole.PATIENT, // Default role on first sign-in.
    });
  }

  const mappedUser = await mapFirebaseUserToUser(user);
  if (!mappedUser) {
    await signOut(auth);
    throw new Error('Profile initialization failed.');
  }

  return mappedUser;
};

/**
 * Signs the current user out.
 */
export const logoutUser = (): Promise<void> => signOut(auth);

/**
 * Sends a password reset email to the provided address.
 */
export const requestPasswordReset = async (email: string): Promise<void> => {
  const normalized = email.trim();
  if (!normalized) {
    throw new Error('Please enter a valid email address.');
  }
  await sendPasswordResetEmail(auth, normalized);
};
