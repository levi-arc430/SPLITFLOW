export type Balance = { member: string; amount: number };
export type Settlement = { from: string; to: string; amount: number };

const SCALE = 1_000_000;

type Node = { member: string; units: number };

function greedy(debtors: Node[], creditors: Node[]): Settlement[] {
  const result: Settlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const units = Math.min(debtors[i].units, creditors[j].units);
    if (units > 0) {
      result.push({
        from: debtors[i].member,
        to: creditors[j].member,
        amount: units / SCALE,
      });
    }
    debtors[i].units -= units;
    creditors[j].units -= units;
    if (debtors[i].units === 0) i++;
    if (creditors[j].units === 0) j++;
  }
  return result;
}

export function optimizeSettlements(balances: Balance[]): Settlement[] {
  const debtors: Node[] = balances
    .filter((b) => b.amount < -0.0000005)
    .map((b) => ({ member: b.member, units: Math.round(-b.amount * SCALE) }));

  const creditors: Node[] = balances
    .filter((b) => b.amount > 0.0000005)
    .map((b) => ({ member: b.member, units: Math.round(b.amount * SCALE) }));

  if (debtors.length + creditors.length > 10) {
    return greedy(
      debtors.map((x) => ({ ...x })),
      creditors.map((x) => ({ ...x })),
    );
  }

  const memo = new Map<string, Settlement[] | null>();

  function solve(ds: Node[], cs: Node[]): Settlement[] | null {
    const key =
      ds.map((x) => x.units).join(",") + "|" + cs.map((x) => x.units).join(",");
    if (memo.has(key)) return memo.get(key)!;

    const di = ds.findIndex((x) => x.units > 0);
    if (di === -1) return [];

    let best: Settlement[] | null = null;

    for (let ci = 0; ci < cs.length; ci++) {
      if (cs[ci].units <= 0) continue;

      const units = Math.min(ds[di].units, cs[ci].units);
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
          amount: units / SCALE,
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
