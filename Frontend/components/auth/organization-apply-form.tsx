"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { 
  LuBuilding2, 
  LuUser, 
  LuShieldCheck, 
  LuSend, 
  LuArrowLeft, 
  LuCircleCheck, 
  LuCircleAlert 
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { api, ApiError, idempotencyKey, register } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";

export function OrganizationApplyForm() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [domain, setDomain] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAuthenticated(isAuthenticated());
    setReady(true);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (!authenticated) {
        await register(ownerEmail, ownerPassword, ownerName);
        setAuthenticated(true);
      }
      await api.post("/api/v1/organizations/applications", {
        name,
        legal_name: legalName || name,
        trading_name: name,
        domain,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        address,
        registration_number: registrationNumber,
        org_type: "company",
        idempotency_key: idempotencyKey(),
      });
      setSuccess(
        "Application submitted successfully. A platform administrator will verify your organization credentials before full tenant activation.",
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Application submission failed. Please check all fields.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <main id="main-content" className="auth-page" style={{ padding: "40px 16px" }}>
      <form className="auth-card panel auth-card--wide" onSubmit={onSubmit} aria-label="Register organization">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div className="wordmark__symbol">T</div>
          <span style={{ font: "600 18px Poppins, sans-serif", letterSpacing: "0.04em" }}>THOS</span>
        </div>

        <div>
          <p className="eyebrow" style={{ color: "var(--brand-600)" }}>Organization Onboarding</p>
          <h1 style={{ fontSize: "24px", marginTop: "2px" }}>Register Your Organization</h1>
          <p className="panel-note" style={{ marginTop: "4px" }}>
            Create an enterprise hiring space with verified talent discovery, structured interview stages, and domain pack enforcement.
          </p>
        </div>

        {success ? (
          <div style={{ padding: "24px", background: "var(--teal-50)", border: "1px solid var(--teal-200)", borderRadius: "8px", display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--teal-800)" }}>
              <LuCircleCheck size={24} style={{ color: "var(--teal-600)", flexShrink: 0 }} />
              <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>Application Received</h2>
            </div>
            <p style={{ fontSize: "14px", color: "var(--teal-900)", lineHeight: 1.5 }}>
              {success}
            </p>
            <div style={{ marginTop: "8px" }}>
              <Link href="/login" className="button button--primary button--md">
                Proceed to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <>
            {!authenticated && (
              <div style={{ display: "grid", gap: "16px", padding: "16px", background: "var(--surface-sunken)", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <LuUser style={{ color: "var(--brand-600)" }} size={18} />
                  <div>
                    <h2 style={{ fontSize: "15px", fontWeight: 600, margin: 0 }}>Administrator Account</h2>
                    <p style={{ fontSize: "12px", color: "var(--ink-500)", margin: 0 }}>The submitter will be assigned as the primary organization owner.</p>
                  </div>
                </div>

                <div className="form-grid">
                  <FormField label="Your Full Name" required>
                    <input
                      className="input"
                      required
                      autoComplete="name"
                      value={ownerName}
                      onChange={(event) => setOwnerName(event.target.value)}
                      placeholder="e.g. Sarah Jenkins"
                    />
                  </FormField>

                  <FormField label="Your Work Email" required>
                    <input
                      className="input"
                      type="email"
                      required
                      autoComplete="username"
                      value={ownerEmail}
                      onChange={(event) => setOwnerEmail(event.target.value)}
                      placeholder="sarah@company.com"
                    />
                  </FormField>

                  <div className="form-grid__full">
                    <FormField label="Password" hint="At least 8 characters" required>
                      <input
                        className="input"
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={ownerPassword}
                        onChange={(event) => setOwnerPassword(event.target.value)}
                        placeholder="••••••••"
                      />
                    </FormField>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "8px" }}>
                <LuBuilding2 style={{ color: "var(--brand-600)" }} size={18} />
                <h2 style={{ fontSize: "15px", fontWeight: 600, margin: 0 }}>Organization Information</h2>
              </div>

              <div className="form-grid">
                <FormField label="Organization / Display Name" required>
                  <input 
                    className="input"
                    required 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="e.g. Acme Health"
                  />
                </FormField>

                <FormField label="Legal Entity Name" hint="Optional if same as display name">
                  <input 
                    className="input"
                    value={legalName} 
                    onChange={(e) => setLegalName(e.target.value)} 
                    placeholder="Acme Health Technologies Inc."
                  />
                </FormField>

                <FormField label="Company Domain" required hint="Must match email domain for instant verification">
                  <input
                    className="input"
                    required
                    placeholder="acmehealth.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                  />
                </FormField>

                <FormField label="Official Contact Email" required>
                  <input
                    className="input"
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="recruiting@acmehealth.com"
                  />
                </FormField>

                <FormField label="Contact Phone" required>
                  <input
                    className="input"
                    required
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+1 (555) 019-2834"
                  />
                </FormField>

                <FormField label="Registration / Tax Number" hint="e.g. EIN or CRN">
                  <input
                    className="input"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    placeholder="XX-XXXXXXX"
                  />
                </FormField>

                <div className="form-grid__full">
                  <FormField label="Physical / Registered Office Address" required>
                    <textarea
                      className="input"
                      required
                      rows={2}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="100 Innovation Way, Suite 400, Austin, TX 78701"
                      style={{ resize: "vertical" }}
                    />
                  </FormField>
                </div>
              </div>
            </div>

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "var(--red-50)", border: "1px solid var(--red-200)", borderRadius: "6px", color: "var(--red-700)", fontSize: "13px" }} role="alert">
                <LuCircleAlert size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-actions" style={{ display: "flex", alignItems: "center", gap: "12px", justifyContent: "flex-end", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
              <Link className="button button--ghost button--md" href={authenticated ? "/" : "/login"}>
                <LuArrowLeft size={14} /> {authenticated ? "Cancel" : "Back to Sign In"}
              </Link>
              <Button type="submit" loading={busy} iconLeft={<LuSend size={15} />}>
                {authenticated ? "Submit Application" : "Create Account & Submit"}
              </Button>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", color: "var(--ink-400)", fontSize: "11px", paddingTop: "6px" }}>
              <LuShieldCheck size={14} style={{ color: "var(--teal-600)" }} />
              <span>Multi-tenant data encryption &amp; enterprise RBAC protected</span>
            </div>
          </>
        )}
      </form>
    </main>
  );
}
