import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNetBalances,
  optimizeSettlements,
  type Balance,
} from "../lib/settlement";

test("nets a circular set of debts into fewer transfers", () => {
  const balances = buildNetBalances([
    { debtor: "A", creditor: "B", units: 30_000_000n },
    { debtor: "B", creditor: "C", units: 20_000_000n },
    { debtor: "C", creditor: "A", units: 10_000_000n },
  ]);

  const plan = optimizeSettlements(balances);
  assert.equal(plan.length, 2);
  assert.equal(
    plan.reduce((sum, transfer) => sum + transfer.units, 0n),
    20_000_000n,
  );
});

test("recalculation subtracts transfers that were already paid", () => {
  const balances = buildNetBalances(
    [
      { debtor: "A", creditor: "B", units: 30_000_000n },
      { debtor: "A", creditor: "C", units: 20_000_000n },
    ],
    [{ from: "A", to: "B", units: 30_000_000n }],
  );

  assert.deepEqual(
    balances.sort((a, b) => a.member.localeCompare(b.member)),
    [
      { member: "a", units: -20_000_000n },
      { member: "c", units: 20_000_000n },
    ],
  );

  const plan = optimizeSettlements(balances);
  assert.deepEqual(plan, [{ from: "a", to: "c", units: 20_000_000n }]);
});

test("keeps exact bigint units with no floating point rounding", () => {
  const balances = buildNetBalances([
    { debtor: "A", creditor: "B", units: 3_333_333n },
    { debtor: "A", creditor: "C", units: 6_666_667n },
  ]);

  assert.equal(
    balances.reduce((sum, balance) => sum + balance.units, 0n),
    0n,
  );
  assert.equal(optimizeSettlements(balances).length, 2);
});

test("rejects unbalanced input to optimizer", () => {
  const invalid: Balance[] = [
    { member: "a", units: -10n },
    { member: "b", units: 9n },
  ];

  assert.throws(
    () => optimizeSettlements(invalid),
    /do not net to zero/,
  );
});
