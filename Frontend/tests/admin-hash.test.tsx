import { act, render, screen } from "@testing-library/react";
import { vi } from "vitest";
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(async (p: string) => (p.endsWith("/organizations/current") ? { organization: { name: "NUT" }, role: "administrator", units: [] } : p.includes("pending") ? { organizations: [] } : {})), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
import { AdminPage } from "@/components/admin/admin-page";

it("follows hash changes after mount", async () => {
  window.location.hash = "";
  render(<AdminPage />);
  await screen.findByRole("heading", { level: 1, name: "NUT" });
  act(() => { window.location.hash = "#audit"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  expect(screen.getByRole("button", { name: "Audit log" })).toHaveAttribute("aria-current", "true");
});
