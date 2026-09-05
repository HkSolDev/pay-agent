"use client";

import { useActionState, useState } from "react";
import { loginAction, LoginState } from "./actions";

interface LoginFormProps {
  nextDestination?: string;
}

export function LoginForm({ nextDestination = "/" }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState<LoginState | null, FormData>(
    loginAction,
    null
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="login-form">
      <input type="hidden" name="next" value={nextDestination} />

      {state?.error && (
        <div className="login-error-banner" role="alert">
          <svg
            className="login-error-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
            width="16"
            height="16"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span>{state.error}</span>
        </div>
      )}

      <div className="login-field">
        <label htmlFor="password-input" className="login-label">
          Access Password
        </label>
        <div className="login-input-wrapper">
          <input
            id="password-input"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoFocus
            autoComplete="current-password"
            placeholder="Enter shared access password"
            className="login-input"
            disabled={isPending}
          />
          <button
            type="button"
            className="login-toggle-btn"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="login-submit-btn"
        id="unlock-queue-submit"
      >
        {isPending ? (
          <span className="login-btn-content">
            <span className="login-spinner" aria-hidden="true" />
            <span>Verifying...</span>
          </span>
        ) : (
          <span>Unlock AP Queue →</span>
        )}
      </button>
    </form>
  );
}
