import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(async (p: string) => (p.includes("organizations/current/domain-packs") ? { activation: { display_name: "Education Pack" } } : p.includes("organizations/current") ? { organization: { name: "NUT" } } : p.includes("postings") ? { postings: [] } : p.includes("pipeline") ? { columns: [] } : { notifications: [], unread_count: 0 })), post: vi.fn() },
  logout: vi.fn(),
}));

import { DashboardShell } from "@/components/dashboard/dashboard-shell";

beforeEach(() => {
  window.localStorage.setItem("thos.access_token", "t");
  window.localStorage.setItem("thos.session", JSON.stringify({ has_employer_membership: true, user: { display_name: "Ayesha Khan" }, memberships: [{ role: "administrator" }] }));
});

describe("employer shell", () => {
  it("renders rail nav with Interviews and without Register organization", () => {
    render(<DashboardShell><p>content</p></DashboardShell>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Interviews" })).toHaveAttribute("href", "/interviews/faculty-panel");
    expect(within(nav).queryByRole("link", { name: /Register organization/ })).toBeNull();
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });
  it("shows the requisitions panel only on Home and Pipeline", () => {
    pathname = "/";
    const { unmount } = render(<DashboardShell><p>x</p></DashboardShell>);
    expect(screen.getByRole("complementary", { name: "Requisitions" })).toBeInTheDocument();
    unmount();
    pathname = "/admin";
    render(<DashboardShell><p>x</p></DashboardShell>);
    expect(screen.queryByRole("complementary", { name: "Requisitions" })).toBeNull();
  });
  it("keeps the skip link and main landmark", () => {
    render(<DashboardShell><p>x</p></DashboardShell>);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
    expect(document.getElementById("main-content")).not.toBeNull();
  });
});
