"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LuUserPlus } from "react-icons/lu";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ApiError, register } from "@/lib/api";

export function RegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email, password, displayName);
      router.replace("/candidate");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Registration failed. Please verify your details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create candidate account"
      subtitle="Build a verified talent profile, apply to curated roles, and take interview assessments."
    >
      <form className="auth__form" onSubmit={onSubmit} aria-label="Create candidate account">
        <FormField id="register-name" label="Full Legal Name" required>
          <input
            id="register-name"
            className="input"
            required
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="e.g. Ayesha Khan"
          />
        </FormField>

        <FormField id="register-email" label="Email Address" required>
          <input
            id="register-email"
            className="input"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
          />
        </FormField>

        <FormField id="register-password" label="Password" hint="At least 8 characters with letters and numbers" required>
          <input
            id="register-password"
            className="input"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </FormField>

        {error && <p className="form-error" role="alert">{error}</p>}

        <Button type="submit" size="lg" loading={busy} iconLeft={<LuUserPlus size={15} />}>
          Create Account &amp; Enter Portal
        </Button>

        <p className="auth__links">
          Already have an account? <Link href="/login" className="link">Sign In</Link>
          {" · "}
          <Link href="/register/organization" className="link">Register Organization</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
