/* =====================================================================
   ONE-TIME SETUP — do this once so Google sign-in & cross-device sync work.

   1. Go to https://console.firebase.google.com → "Add project" (free).
   2. In your new project: Build → Authentication → Get started →
      enable the "Google" sign-in provider.
   3. Build → Firestore Database → Create database → start in
      "production mode" (any region is fine).
      Then go to the "Rules" tab and paste this, then Publish:
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /users/{userId}/{document=**} {
              allow read, write: if request.auth != null && request.auth.uid == userId;
            }
          }
        }
   4. Project settings (gear icon) → General → "Your apps" →
      click the </> (web) icon → register app → copy the
      firebaseConfig object it gives you → paste it below,
      replacing the placeholder values in FIREBASE_CONFIG.
   5. Still in Project settings → Authentication → Settings →
      "Authorized domains" → add the domain you'll host this file on
      (if you just open the file locally, "localhost" is already
      allowed — for real phone+laptop use, host it somewhere like
      Firebase Hosting, Netlify, or GitHub Pages and add that domain).
   6. Save this file, open it, and sign in with Google on each device.
      Until you do this, the app works fine but stays on-device only
      (each browser keeps its own local copy).
   ===================================================================== */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCR3bEwShBmMGodbeM_A9VDhpB7OUEjmAk",
  authDomain: "routine-app-40b8e.firebaseapp.com",
  projectId: "routine-app-40b8e",
  storageBucket: "routine-app-40b8e.firebasestorage.app",
  messagingSenderId: "695299766921",
  appId: "1:695299766921:web:aa73b3e61a3d311863a458"
};

window.FIREBASE_READY = !Object.values(window.FIREBASE_CONFIG).some(v => String(v).startsWith('REPLACE_WITH'));

if(window.FIREBASE_READY){
  import("https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js").then(async ({ initializeApp }) => {
    const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } =
      await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js");
    const { getFirestore, doc, getDoc, setDoc, onSnapshot } =
      await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");

    const app = initializeApp(window.FIREBASE_CONFIG);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const provider = new GoogleAuthProvider();

    window.__ledgerFirebase = { auth, db, doc, getDoc, setDoc, onSnapshot, signInWithPopup, provider, signOut, onAuthStateChanged };
    window.dispatchEvent(new Event('ledger-firebase-ready'));
  }).catch(err => {
    console.error('Routine: Firebase failed to load', err);
    window.dispatchEvent(new Event('ledger-firebase-error'));
  });
} else {
  window.dispatchEvent(new Event('ledger-firebase-unconfigured'));
}
