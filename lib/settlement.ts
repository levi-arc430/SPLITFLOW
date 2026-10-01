export type Balance = { member: string; units: bigint };
export type Settlement = { from: string; to: string; units: bigint };

type Node = { member: string; units: bigint };

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
