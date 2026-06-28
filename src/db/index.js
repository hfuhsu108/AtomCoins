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
