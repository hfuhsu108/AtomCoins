// M2 起：CRUD 已切換為 Firestore 版（docs/07 M2），本檔保留為轉發層，讓既有呼叫端
// import 路徑（'../db/repo'）不動。M3 去 Dexie 收尾時將 firestore-repo.js 內容併回本檔。
export * from './firestore-repo'
