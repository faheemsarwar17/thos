"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { LuBuilding2, LuUser, LuSend, LuArrowLeft, LuCircleCheck, LuCircleAlert } from "react-icons/lu";
import { AuthLayout } from "@/components/auth/auth-layout";
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
    <AuthLayout
      wide
      title="Register your organization"
      subtitle="Create a hiring workspace with verified talent discovery, structured interview stages, and domain pack enforcement."
    >
      <form className="auth__form" onSubmit={onSubmit} aria-label="Register organization">
        {success ? (
          <div className="note-box note-box--ok auth__success" role="status">
            <h2><LuCircleCheck size={22} aria-hidden="true" /> Application Received</h2>
            <p>{success}</p>
            <div>
              <Link href="/login" className="button button--primary">
                Proceed to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <>
            {!authenticated && (
              <fieldset className="auth__section auth__section--boxed">
                <legend className="auth__legend">
                  <LuUser size={16} aria-hidden="true" /> Administrator Account
                </legend>
                <p className="panel-note">The submitter will be assigned as the primary organization owner.</p>

                <div className="form-grid auth__grid">
                  <FormField id="org-owner-name" label="Your Full Name" required>
                    <input
                      id="org-owner-name"
                      className="input"
                      required
                      autoComplete="name"
                      value={ownerName}
                      onChange={(event) => setOwnerName(event.target.value)}
                      placeholder="e.g. Sarah Jenkins"
                    />
                  </FormField>

                  <FormField id="org-owner-email" label="Your Work Email" required>
                    <input
                      id="org-owner-email"
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
                    <FormField id="org-owner-password" label="Password" hint="At least 8 characters" required>
                      <input
                        id="org-owner-password"
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
              </fieldset>
            )}

            <fieldset className="auth__section">
              <legend className="auth__legend">
                <LuBuilding2 size={16} aria-hidden="true" /> Organization Information
              </legend>

              <div className="form-grid auth__grid">
                <FormField id="org-name" label="Organization / Display Name" required>
                  <input id="org-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Health" />
                </FormField>

                <FormField id="org-legal" label="Legal Entity Name" hint="Optional if same as display name">
                  <input id="org-legal" className="input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Acme Health Technologies Inc." />
                </FormField>

                <FormField id="org-domain" label="Company Domain" required hint="Must match email domain for instant verification">
                  <input id="org-domain" className="input" required placeholder="acmehealth.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
                </FormField>

                <FormField id="org-contact-email" label="Official Contact Email" required>
                  <input id="org-contact-email" className="input" type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="recruiting@acmehealth.com" />
                </FormField>

                <FormField id="org-phone" label="Contact Phone" required>
                  <input id="org-phone" className="input" required value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1 (555) 019-2834" />
                </FormField>

                <FormField id="org-registration" label="Registration / Tax Number" hint="e.g. EIN or CRN">
                  <input id="org-registration" className="input" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="XX-XXXXXXX" />
                </FormField>

                <div className="form-grid__full">
                  <FormField id="org-address" label="Physical / Registered Office Address" required>
                    <textarea
                      id="org-address"
                      className="textarea"
                      required
                      rows={2}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="100 Innovation Way, Suite 400, Austin, TX 78701"
                    />
                  </FormField>
                </div>
              </div>
            </fieldset>

            {error && (
              <p className="thread__error auth__error" role="alert">
                <LuCircleAlert size={16} aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}

            <div className="auth__actions">
              <Link className="button button--ghost" href={authenticated ? "/" : "/login"}>
                <LuArrowLeft size={14} aria-hidden="true" /> {authenticated ? "Cancel" : "Back to Sign In"}
              </Link>
              <Button type="submit" loading={busy} iconLeft={<LuSend size={15} />}>
                {authenticated ? "Submit Application" : "Create Account & Submit"}
              </Button>
            </div>
          </>
        )}
      </form>
    </AuthLayout>
  );
}
