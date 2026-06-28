# 02 — 記帳規則與計算引擎

> 先讀「三大核心觀念」（見根目錄 `CLAUDE.md`）：記錄日 vs 入帳日、拆帳 splits、收支 vs 資產轉移。本檔是這三點的計算落地。

## 4.1 帳戶餘額

```
餘額(account, D) = openingBalance + Σ postings(account, postingDate ≤ D)
```

postings 來源（同一引擎讀兩種來源：Transaction 與 StockTransaction）：

| 來源 | 帳戶 | 金額 | 入帳日 |
|---|---|---|---|
| 支出 | accountId | −amount | postingDate |
| 收入 | accountId | +amount | postingDate |
| 轉帳 | fromAccountId / toAccountId | −amount / +amount；fromAccountId 另 −fee | postingDate |
| 應收(借出) | accountId | −amount；還款 +repayment | postingDate / 還款日 |
| 應付(借入) | accountId | +amount；還款 −repayment | postingDate / 還款日 |
| 股票買進 | settlementBankId | −(買進交割金額) | settlementDate |
| 股票賣出 | settlementBankId | +(賣出交割金額) | settlementDate |

> 信用卡用「帳戶」模型：刷卡=一筆 `expense`，accountId 指向信用卡帳戶（餘額為負＝未繳）；繳卡費=一筆 `transfer`（銀行→信用卡）。可用額度 = creditLimit + 餘額（餘額為負）。

## 4.2 交割銀行可用餘額試算（買單前檢查）

新買單需求金額 = `shares×price + fee`，將於 settlementDate 扣款。

```
可用餘額 = 餘額(交割銀行, settlementDate)   // 已含所有「未交割」買賣的影響
```

若 需求 > 可用 → **跳警告但仍允許記錄**（含當筆與所有尚未交割者）。

## 4.3 淨資產

```
淨資產 = Σ 各帳戶餘額(現金/銀行/信用卡；信用卡為負)
       + Σ 持股市值(現價 × 持股)
       + Σ 應收未結清
       − Σ 應付未結清
```

## 4.4 報表聚合範圍

- **收支統計**：只取 type∈{expense, income} 的拆帳列，依 類別/標籤/專案/對象/帳戶/時間 聚合。
- **不計入收支**：轉帳本金、借還款本金、股票買賣本金（資產轉移）。
- **計入支出**：轉帳手續費（歸 feeCategoryId）。
- **投資報表（獨立）**：各標的未實現損益、已實現損益、報酬率（配息先留空）。
