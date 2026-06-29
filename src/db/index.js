import Dexie from 'dexie'

export const db = new Dexie('AtomCoins')

db.version(1).stores({
  accounts: 'id, type, sortOrder, isArchived',

  categories: 'id, kind, parentId, sortOrder, isArchived',

  tags: 'id, name',

  projects: 'id, name, isArchived',

  counterparties: 'id, name',

  transactions:
    'id, type, tradeDate, postingDate, accountId, fromAccountId, toAccountId, counterpartyId, *tagIds, projectId, linkGroupId, invoiceId',

  invoices: 'id, status, source, invoiceNumber, invoiceDate, transactionId',

  brokers: 'id, name',

  stockTransactions:
    'id, securitiesAccountId, symbol, side, tradeDate, settlementDate, brokerId',

  stockPrices: 'symbol',

  settings: 'id',
})

// v2（階段2）：延後入帳引擎共用之新 entity。transactions 補 installmentPlanId /
// recurringRuleId 索引（分期、週期性的分組顯示與整組刪除用）。其餘 table 自 v1 帶過。
db.version(2).stores({
  transactions:
    'id, type, tradeDate, postingDate, accountId, fromAccountId, toAccountId, counterpartyId, *tagIds, projectId, linkGroupId, invoiceId, installmentPlanId, recurringRuleId',

  creditCardStatements: 'id, accountId, periodEnd, isPaid',

  installmentPlans: 'id, accountId, startDate',

  recurringRules: 'id, isActive, nextDate',
})
