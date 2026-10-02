import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell">
      <section className="surface errorRecovery">
        <div className="eyebrow">404</div>
        <h1>Page not found.</h1>
        <p>The SplitFlow page or payment request you opened does not exist.</p>
        <Link className="primary" href="/">Back to SplitFlow</Link>
      </section>
    </main>
  );
}
