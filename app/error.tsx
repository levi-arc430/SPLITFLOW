"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("SplitFlow UI error", error);
  }, [error]);

  return (
    <main className="shell">
      <section className="surface errorRecovery">
        <div className="eyebrow">SplitFlow recovery</div>
        <h1>Something went wrong.</h1>
        <p>
          Your wallet and funds are not affected. Retry the screen first. If the
          problem continues, reload SplitFlow and reconnect your wallet.
        </p>
        <button className="primary" onClick={reset}>
          <RefreshCw size={15} /> Retry
        </button>
      </section>
    </main>
  );
}
