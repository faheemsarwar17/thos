"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LuLogIn, LuShieldCheck, LuBriefcase, LuUser } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ApiError, login } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("ayesha.khan@nut.edu.pk");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await login(email, password);
      router.replace(session.has_employer_membership ? "/" : "/candidate");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Sign-in failed. Please check your credentials.");
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword("Password123!");
    setError(null);
  }

  return (
    <main id="main-content" className="auth-page">
      <form className="auth-card" onSubmit={onSubmit} aria-label="Sign in to THOS">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div className="wordmark__symbol">T</div>
          <span style={{ font: "600 18px Poppins, sans-serif", letterSpacing: "0.04em" }}>THOS</span>
        </div>

        <div>
          <p className="eyebrow" style={{ color: "var(--brand-600)" }}>Talent Hiring Operating System</p>
          <h1 style={{ fontSize: "22px", marginTop: "2px" }}>Sign In to Workspace</h1>
          <p className="panel-note" style={{ marginTop: "4px" }}>
            Access your verified candidate profile or hiring organization console.
          </p>
        </div>

        {/* Quick Demo Fill Buttons */}
        <div style={{ padding: "10px 12px", background: "var(--surface-sunken)", borderRadius: "8px", display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-500)", textTransform: "uppercase" }}>
            Quick Demo Accounts:
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="button button--secondary button--sm"
              style={{ flex: 1, fontSize: "11px" }}
              onClick={() => fillDemo("ayesha.khan@nut.edu.pk")}
            >
              <LuBriefcase size={12} /> Employer Admin
            </button>
            <button
              type="button"
              className="button button--secondary button--sm"
              style={{ flex: 1, fontSize: "11px" }}
              onClick={() => fillDemo("hira.ahmed@gmail.com")}
            >
              <LuUser size={12} /> Candidate
            </button>
          </div>
        </div>

        <FormField label="Email Address" required>
          <input
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@organization.com"
          />
        </FormField>

        <FormField label="Password" required>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>

        {error && <p className="form-error" role="alert">{error}</p>}

        <Button type="submit" loading={busy} iconLeft={<LuLogIn size={15} />}>
          Sign In
        </Button>

        <div style={{ textAlign: "center", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
          <p className="panel-note" style={{ fontSize: "12px" }}>
            Don&apos;t have an account?{" "}
            <Link href="/register" style={{ color: "var(--brand-600)", fontWeight: 600 }}>
              Candidate Registration
            </Link>
            {" · "}
            <Link href="/register/organization" style={{ color: "var(--brand-600)", fontWeight: 600 }}>
              Register Organization
            </Link>
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", color: "var(--ink-400)", fontSize: "11px" }}>
          <LuShieldCheck size={14} style={{ color: "var(--teal-600)" }} />
          <span>Tenant-isolated &amp; WCAG 2.2 AA compliant</span>
        </div>
      </form>
    </main>
  );
}
