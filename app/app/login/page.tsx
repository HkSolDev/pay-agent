import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import "./login.css";

export const metadata: Metadata = {
  title: "Restricted Access · Perflo AP Agent",
  description: "Shared password gate for the Perflo Accounts Payable Agent",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = await searchParams;
  const nextDestination = resolvedParams?.next || "/";

  return (
    <main className="login-container">
      <div className="login-card">
        <header className="login-header">
          <div className="login-pill">
            <span className="login-pill-dot" />
            <span>Restricted Access</span>
          </div>
          <h1 className="login-title">Perflo AP Agent</h1>
          <p className="login-description">
            This deployment controls live accounts payable execution. Enter the team shared access password to unlock the queue.
          </p>
        </header>

        <LoginForm nextDestination={nextDestination} />

        <footer className="login-footer">
          <span className="login-footer-text">
            Configured via <code className="login-footer-code">APP_ACCESS_PASSWORD</code>
          </span>
          <span className="login-footer-text">v0.1.0</span>
        </footer>
      </div>
    </main>
  );
}
