export type Balance = { member: string; amount: number };
export type Settlement = { from: string; to: string; amount: number };

export function optimizeSettlements(balances: Balance[]): Settlement[] {
  const creditors = balances
    .filter((b) => b.amount > 0.000001)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.amount - a.amount);

  const debtors = balances
    .filter((b) => b.amount < -0.000001)
    .map((b) => ({ member: b.member, amount: Math.abs(b.amount) }))
    .sort((a, b) => b.amount - a.amount);

  const result: Settlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);

    if (amount > 0.000001) {
      result.push({
        from: debtors[i].member,
        to: creditors[j].member,
        amount: Number(amount.toFixed(6)),
      });
    }

    debtors[i].amount -= amount;
    creditors[j].amount -= amount;

    if (debtors[i].amount <= 0.000001) i++;
    if (creditors[j].amount <= 0.000001) j++;
  }

  return result;
}
