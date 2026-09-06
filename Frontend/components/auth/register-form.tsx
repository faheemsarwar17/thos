"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LuUserPlus, LuShieldCheck } from "react-icons/lu";
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
    <main id="main-content" className="auth-page">
      <form className="auth-card" onSubmit={onSubmit} aria-label="Create candidate account">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div className="wordmark__symbol">T</div>
          <span style={{ font: "600 18px Poppins, sans-serif", letterSpacing: "0.04em" }}>THOS</span>
        </div>

        <div>
          <p className="eyebrow" style={{ color: "var(--brand-600)" }}>Candidate Portal</p>
          <h1 style={{ fontSize: "22px", marginTop: "2px" }}>Create Candidate Account</h1>
          <p className="panel-note" style={{ marginTop: "4px" }}>
            Personal accounts allow you to build a verified talent profile, apply to curated roles, and participate in interview assessments.
          </p>
        </div>

        <FormField label="Full Legal Name" required>
          <input
            className="input"
            required
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="e.g. Ayesha Khan"
          />
        </FormField>

        <FormField label="Email Address" required>
          <input
            className="input"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
          />
        </FormField>

        <FormField label="Password" hint="At least 8 characters with letters and numbers" required>
          <input
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

        <Button type="submit" loading={busy} iconLeft={<LuUserPlus size={15} />}>
          Create Account &amp; Enter Portal
        </Button>

        <div style={{ textAlign: "center", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
          <p className="panel-note" style={{ fontSize: "12px" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--brand-600)", fontWeight: 600 }}>
              Sign In
            </Link>
            {" · "}
            <Link href="/register/organization" style={{ color: "var(--brand-600)", fontWeight: 600 }}>
              Register Organization
            </Link>
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", color: "var(--ink-400)", fontSize: "11px" }}>
          <LuShieldCheck size={14} style={{ color: "var(--teal-600)" }} />
          <span>Tenant-isolated &amp; Privacy-first candidate profile</span>
        </div>
      </form>
    </main>
  );
}
