// Firebase 初始化（docs/07 §2、§3）。web config 屬公開值、刻意寫死於原始碼——
// 防線在 Firestore security rules（firestore.rules），同 GAS 股價 proxy URL 寫死之先例。
// 真機密（service account JSON 等）一律不進 repo，見 docs/07 §3 分層表。
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey: 'AIzaSyC1Y7fbkvZtHylQ6wT_tmE34eIbiNNVgI8',
  authDomain: 'project-f5f328a9-c43d-4887-bd3.firebaseapp.com',
  projectId: 'project-f5f328a9-c43d-4887-bd3',
  storageBucket: 'project-f5f328a9-c43d-4887-bd3.firebasestorage.app',
  messagingSenderId: '881497798441',
  appId: '1:881497798441:web:91729b593f082ddd692938',
  measurementId: 'G-K53BQP02J5',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// persistentLocalCache：離線可讀寫、復網自動同步；multipleTab 讓多分頁共用快取（docs/07 §2-4）
export const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

// Cloud Functions（批次 7 Web Push 的 callable）；region 對齊 functions 部署的 asia-east1
export const functions = getFunctions(app, 'asia-east1')

const googleProvider = new GoogleAuthProvider()

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider)
}

export function signOutUser() {
  return signOut(auth)
}
