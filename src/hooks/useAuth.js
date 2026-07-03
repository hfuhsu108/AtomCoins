import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'

// 三態：undefined＝Firebase 尚未回報（首載瞬間，勿當未登入處理）、null＝未登入、物件＝已登入
export function useAuth() {
  const [user, setUser] = useState(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  return user
}
