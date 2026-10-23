import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

const { push, get, post } = vi.hoisted(() => ({
  push: vi.fn(),
  get: vi.fn(async (path: string) => {
    if (path.startsWith("/api/v1/search")) return { postings: [{ id: "p1", title: "Lecturer", status: "published", location: "Lahore" }], applications: [{ id: "a1", posting_id: "p1", candidate_name: "Hira Ahmed", job_title: "Lecturer", stage_id: "received" }] };
    if (path === "/api/v1/notifications") return { notifications: [{ id: "n1", title: "3 waiting", body: "Review them", link: "/pipeline", read: 0, created_at: new Date().toISOString() }], unread_count: 1 };
    return {};
  }),
  post: vi.fn(async () => ({})),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: { get, post } }));

import { CommandPalette } from "@/components/layout/command-palette";
import { NotificationsPanel } from "@/components/layout/notifications-panel";

describe("CommandPalette", () => {
  it("opens with Ctrl+K and lists destinations", () => {
    render(<CommandPalette persona="employer" destinations={[{ label: "Pipeline", href: "/pipeline" }]} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: /command palette/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Pipeline/ })).toBeInTheDocument();
  });
  it("searches after 2 characters and links candidates to the drawer deep link", async () => {
    vi.useFakeTimers();
    render(<CommandPalette persona="employer" destinations={[]} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "hi" } });
    await act(async () => { vi.advanceTimersByTime(250); });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByRole("option", { name: /Hira Ahmed/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("option", { name: /Hira Ahmed/ }));
    expect(push).toHaveBeenCalledWith("/pipeline?posting=p1&applicationId=a1");
  });
});

describe("NotificationsPanel", () => {
  it("shows unread count and marks all read", async () => {
    render(<NotificationsPanel persona="employer" />);
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    fireEvent.click(bell);
    expect(await screen.findByText("3 waiting")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/notifications/mark-read"));
    expect(screen.getByRole("link", { name: "Open audit log" })).toHaveAttribute("href", "/admin#audit");
  });
});
