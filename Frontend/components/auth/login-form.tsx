"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LuLogIn, LuBriefcase, LuUser } from "react-icons/lu";
import { AuthLayout } from "@/components/auth/auth-layout";
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
    <AuthLayout title="Sign in" subtitle="Access your verified candidate profile or hiring organization console.">
      <form className="auth__form" onSubmit={onSubmit} aria-label="Sign in to THOS">
        <div className="auth__demo">
          <span className="auth__demo-label">Quick Demo Accounts</span>
          <div className="auth__demo-row">
            <button type="button" className="button button--secondary button--sm" onClick={() => fillDemo("ayesha.khan@nut.edu.pk")}>
              <LuBriefcase size={12} aria-hidden="true" /> Employer Admin
            </button>
            <button type="button" className="button button--secondary button--sm" onClick={() => fillDemo("hira.ahmed@gmail.com")}>
              <LuUser size={12} aria-hidden="true" /> Candidate
            </button>
          </div>
        </div>

        <FormField id="login-email" label="Email Address" required>
          <input
            id="login-email"
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@organization.com"
          />
        </FormField>

        <FormField id="login-password" label="Password" required>
          <input
            id="login-password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>

        {error && <p className="form-error" role="alert">{error}</p>}

        <Button type="submit" size="lg" loading={busy} iconLeft={<LuLogIn size={15} />}>
          Sign In
        </Button>

        <p className="auth__links">
          Don&apos;t have an account? <Link href="/register" className="link">Candidate Registration</Link>
          {" · "}
          <Link href="/register/organization" className="link">Register Organization</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
