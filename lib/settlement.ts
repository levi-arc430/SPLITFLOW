export type Balance = { member: string; units: bigint };
export type Settlement = { from: string; to: string; units: bigint };
export type Obligation = { debtor: string; creditor: string; units: bigint };
export type AppliedTransfer = { from: string; to: string; units: bigint };

type Node = { member: string; units: bigint };

export function buildNetBalances(
  obligations: Obligation[],
  appliedTransfers: AppliedTransfer[] = [],
): Balance[] {
  const balances = new Map<string, bigint>();

  for (const obligation of obligations) {
    if (obligation.units < 0n) throw new Error("Obligation units cannot be negative");
    const debtor = obligation.debtor.toLowerCase();
    const creditor = obligation.creditor.toLowerCase();

    balances.set(debtor, (balances.get(debtor) || 0n) - obligation.units);
    balances.set(creditor, (balances.get(creditor) || 0n) + obligation.units);
  }

  // A previously confirmed optimized transfer reduces the sender's debt and
  // the recipient's credit. This lets SplitFlow safely recalculate an
  // unfinished settlement without asking anyone to pay twice.
  for (const transfer of appliedTransfers) {
    if (transfer.units < 0n) throw new Error("Transfer units cannot be negative");
    const from = transfer.from.toLowerCase();
    const to = transfer.to.toLowerCase();

    balances.set(from, (balances.get(from) || 0n) + transfer.units);
    balances.set(to, (balances.get(to) || 0n) - transfer.units);
  }

  const total = [...balances.values()].reduce((sum, value) => sum + value, 0n);
  if (total !== 0n) throw new Error("Settlement balances do not net to zero");

  return [...balances.entries()]
    .filter(([, units]) => units !== 0n)
    .map(([member, units]) => ({ member, units }));
}

function greedy(debtors: Node[], creditors: Node[]): Settlement[] {
  const result: Settlement[] = [];
  const ds = debtors
    .map((x) => ({ ...x }))
    .sort((a, b) => (a.units === b.units ? 0 : a.units > b.units ? -1 : 1));
  const cs = creditors
    .map((x) => ({ ...x }))
    .sort((a, b) => (a.units === b.units ? 0 : a.units > b.units ? -1 : 1));

  let i = 0;
  let j = 0;

  while (i < ds.length && j < cs.length) {
    const units = ds[i].units < cs[j].units ? ds[i].units : cs[j].units;

    if (units > 0n) {
      result.push({
        from: ds[i].member,
        to: cs[j].member,
        units,
      });
    }

    ds[i].units -= units;
    cs[j].units -= units;

    if (ds[i].units === 0n) i++;
    if (cs[j].units === 0n) j++;
  }

  return result;
}

export function optimizeSettlements(balances: Balance[]): Settlement[] {
  const debtors: Node[] = balances
    .filter((b) => b.units < 0n)
    .map((b) => ({ member: b.member, units: -b.units }));

  const creditors: Node[] = balances
    .filter((b) => b.units > 0n)
    .map((b) => ({ member: b.member, units: b.units }));

  const totalDebt = debtors.reduce((sum, item) => sum + item.units, 0n);
  const totalCredit = creditors.reduce((sum, item) => sum + item.units, 0n);
  if (totalDebt !== totalCredit) {
    throw new Error("Settlement balances do not net to zero");
  }

  if (debtors.length + creditors.length > 10) {
    return greedy(debtors, creditors);
  }

  const memo = new Map<string, Settlement[] | null>();

  function solve(ds: Node[], cs: Node[]): Settlement[] | null {
    const key =
      ds.map((x) => x.units.toString()).join(",") +
      "|" +
      cs.map((x) => x.units.toString()).join(",");

    if (memo.has(key)) return memo.get(key)!;

    const di = ds.findIndex((x) => x.units > 0n);
    if (di === -1) return [];

    let best: Settlement[] | null = null;

    for (let ci = 0; ci < cs.length; ci++) {
      if (cs[ci].units <= 0n) continue;

      const units = ds[di].units < cs[ci].units ? ds[di].units : cs[ci].units;
      const nextD = ds.map((x) => ({ ...x }));
      const nextC = cs.map((x) => ({ ...x }));

      nextD[di].units -= units;
      nextC[ci].units -= units;

      const rest = solve(nextD, nextC);
      if (!rest) continue;

      const candidate: Settlement[] = [
        {
          from: ds[di].member,
          to: cs[ci].member,
          units,
        },
        ...rest,
      ];

      if (!best || candidate.length < best.length) best = candidate;
      if (ds[di].units === cs[ci].units) break;
    }

    memo.set(key, best);
    return best;
  }

  return solve(debtors, creditors) || [];
}
