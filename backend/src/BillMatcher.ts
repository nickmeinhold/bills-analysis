import { Transaction } from "./StatementAnalyzer.js";

export interface Bill {
  id: string;
  company: string | null;
  amount: number | null;
  dueDate: string | null;
  status: string;
}

export interface Match {
  transactionDate: string;
  transactionDescription: string;
  transactionAmount: number;
  billId: string;
  billCompany: string | null;
  billAmount: number | null;
  billDueDate: string | null;
  confidence: number;
}

export class BillMatcher {
  /**
   * Match transactions to unpaid bills
   * Returns an array of matches with confidence scores
   */
  matchTransactionsToBills(
    transactions: Transaction[],
    bills: Bill[]
  ): Match[] {
    const matches: Match[] = [];
    const unpaidBills = bills.filter((b) => b.status !== "paid");

    for (const tx of transactions) {
      // Only match debit transactions (payments)
      if (tx.type !== "debit") continue;

      const match = this.findBestMatch(tx, unpaidBills);
      if (match) {
        matches.push(match);
      }
    }

    return matches;
  }

  private findBestMatch(tx: Transaction, bills: Bill[]): Match | null {
    let bestMatch: Match | null = null;
    let bestScore = 0;

    for (const bill of bills) {
      if (!bill.amount) continue;

      const score = this.calculateMatchScore(tx, bill);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = {
          transactionDate: tx.date,
          transactionDescription: tx.description,
          transactionAmount: tx.amount,
          billId: bill.id,
          billCompany: bill.company,
          billAmount: bill.amount,
          billDueDate: bill.dueDate,
          confidence: Math.round(score * 100),
        };
      }
    }

    return bestMatch;
  }

  private calculateMatchScore(tx: Transaction, bill: Bill): number {
    let score = 0;

    // Amount matching (most important) - within 2% tolerance
    if (bill.amount) {
      const amountDiff = Math.abs(tx.amount - bill.amount) / bill.amount;
      if (amountDiff <= 0.02) {
        score += 0.5; // 50% weight for amount match
      } else if (amountDiff <= 0.05) {
        score += 0.3; // Partial score for close match
      } else {
        return 0; // No match if amount is too different
      }
    }

    // Date matching - transaction should be around or after due date
    if (bill.dueDate) {
      const txDate = new Date(tx.date);
      const dueDate = new Date(bill.dueDate);
      const daysDiff = (txDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24);

      // Transaction should be within -7 to +14 days of due date
      if (daysDiff >= -7 && daysDiff <= 14) {
        score += 0.3; // 30% weight for date match
      } else if (daysDiff >= -14 && daysDiff <= 30) {
        score += 0.15; // Partial score
      }
    }

    // Company name matching (fuzzy)
    if (bill.company) {
      const similarity = this.calculateNameSimilarity(
        tx.description.toLowerCase(),
        bill.company.toLowerCase()
      );
      score += similarity * 0.2; // 20% weight for name match
    }

    return score;
  }

  private calculateNameSimilarity(txDesc: string, billCompany: string): number {
    // Simple word overlap check
    const txWords = txDesc.split(/\s+/).filter((w) => w.length > 2);
    const billWords = billCompany.split(/\s+/).filter((w) => w.length > 2);

    if (billWords.length === 0) return 0;

    let matchCount = 0;
    for (const billWord of billWords) {
      if (txDesc.includes(billWord)) {
        matchCount++;
      }
    }

    // Also check if company name is contained in description
    if (txDesc.includes(billCompany)) {
      return 1;
    }

    // Check common abbreviations
    const commonMappings: Record<string, string[]> = {
      electricity: ["agl", "origin", "energy", "ausgrid"],
      internet: ["optus", "telstra", "nbn", "tpg", "iinet"],
      phone: ["optus", "telstra", "vodafone", "amaysim"],
      insurance: ["nrma", "allianz", "qbe", "suncorp"],
      netflix: ["netflix"],
      spotify: ["spotify"],
      amazon: ["amzn", "amazon", "aws"],
    };

    for (const [category, keywords] of Object.entries(commonMappings)) {
      const billHasCategory = billCompany.includes(category);
      const txHasKeyword = keywords.some((kw) => txDesc.includes(kw));
      if (billHasCategory && txHasKeyword) {
        return 0.8;
      }
    }

    return matchCount / billWords.length;
  }
}
