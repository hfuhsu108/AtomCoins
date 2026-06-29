import { nanoid } from 'nanoid'

// 離線可產生、不撞號的字串 id（見 docs/01 §慣例）
export const newId = () => nanoid()
