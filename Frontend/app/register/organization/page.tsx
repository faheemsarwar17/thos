import type { Metadata } from "next";
import { OrganizationApplyForm } from "@/components/auth/organization-apply-form";

export const metadata: Metadata = { title: "Register organization · THOS" };

export default function OrganizationRegisterPage() {
  return <OrganizationApplyForm />;
}
