/**
 * Firebase Configuration for Little Heroes
 * 
 * ⚠️ 설정 방법:
 * 1. Firebase Console(https://console.firebase.google.com/)에서 프로젝트를 생성합니다.
 * 2. 프로젝트 설정 > 일반 > 내 앱 > 웹 앱 추가에서 설정값을 복사합니다.
 * 3. 아래 YOUR_... 플레이스홀더를 실제 값으로 교체합니다.
 * 4. Authentication > Sign-in method에서 이메일/비밀번호와 Google 로그인을 활성화합니다.
 * 5. Firestore Database를 생성합니다.
 */

// Firebase CDN 모듈 import
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Firebase 설정 (⚠️ 실제 값으로 교체 필요)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

/**
 * Firebase가 설정되었는지 확인
 */
function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "YOUR_API_KEY";
}

/**
 * 부모 회원가입 (이메일/비밀번호)
 */
async function signUpWithEmail(email, password, displayName) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  // 프로필 이름 설정
  await updateProfile(user, { displayName });
  
  // Firestore에 부모 문서 생성
  await setDoc(doc(db, 'parents', user.uid), {
    email: email,
    displayName: displayName,
    role: 'parent',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  return user;
}

/**
 * Google 로그인
 */
async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  
  // Firestore에 부모 문서가 없으면 생성
  const parentDoc = await getDoc(doc(db, 'parents', user.uid));
  if (!parentDoc.exists()) {
    await setDoc(doc(db, 'parents', user.uid), {
      email: user.email,
      displayName: user.displayName,
      role: 'parent',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
  
  return user;
}

/**
 * 이메일/비밀번호 로그인
 */
async function loginWithEmail(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/**
 * 로그아웃
 */
async function logout() {
  // 자녀 프로필 선택 해제
  sessionStorage.removeItem('activeChildProfile');
  await signOut(auth);
}

/**
 * 자녀 프로필 추가
 */
async function addChildProfile(parentUid, childData) {
  const childRef = doc(collection(db, 'parents', parentUid, 'children'));
  await setDoc(childRef, {
    nickname: childData.nickname,
    avatarIndex: childData.avatarIndex || 0,
    birthYear: childData.birthYear || null,
    createdAt: serverTimestamp()
  });
  return childRef.id;
}

/**
 * 자녀 프로필 목록 가져오기
 */
async function getChildProfiles(parentUid) {
  const childrenRef = collection(db, 'parents', parentUid, 'children');
  const snapshot = await getDocs(childrenRef);
  const children = [];
  snapshot.forEach((doc) => {
    children.push({ id: doc.id, ...doc.data() });
  });
  return children;
}

/**
 * 자녀 프로필 수정
 */
async function updateChildProfile(parentUid, childId, updatedData) {
  const childRef = doc(db, 'parents', parentUid, 'children', childId);
  await updateDoc(childRef, updatedData);
}

/**
 * 자녀 프로필 삭제
 */
async function deleteChildProfile(parentUid, childId) {
  const childRef = doc(db, 'parents', parentUid, 'children', childId);
  await deleteDoc(childRef);
}

/**
 * 현재 활성 자녀 프로필 설정/가져오기 (세션 기반)
 */
function setActiveChildProfile(childProfile) {
  sessionStorage.setItem('activeChildProfile', JSON.stringify(childProfile));
  window.dispatchEvent(new CustomEvent('childProfileChanged', { detail: childProfile }));
}

function getActiveChildProfile() {
  const stored = sessionStorage.getItem('activeChildProfile');
  return stored ? JSON.parse(stored) : null;
}

// Export
export {
  auth, db, googleProvider,
  isFirebaseConfigured,
  onAuthStateChanged,
  signUpWithEmail, signInWithGoogle, loginWithEmail, logout,
  addChildProfile, getChildProfiles, updateChildProfile, deleteChildProfile,
  setActiveChildProfile, getActiveChildProfile
};
