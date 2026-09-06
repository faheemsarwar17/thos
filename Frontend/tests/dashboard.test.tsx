import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { EmployerDashboard } from "@/components/dashboard/employer-dashboard";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  const payloads: Record<string, unknown> = {
    "/api/v1/analytics/pipeline": {
      analytics: { in_flight: 2, hired: 1, rejected: 0, total_applications: 3 },
    },
    "/api/v1/postings": {
      postings: [
        {
          id: "post_1",
          title: "Grade 6 Science Teacher",
          location: "Lahore",
          status: "published",
          pool_status: "locked",
          application_count: 3,
        },
      ],
    },
    "/api/v1/pipeline": { columns: [] },
    "/api/v1/notifications": { notifications: [] },
  };
  return {
    ...actual,
    api: {
      ...actual.api,
      get: vi.fn(async (path: string) => payloads[path] ?? {}),
    },
  };
});

describe("employer dashboard", () => {
  it("surfaces priority work, requisitions, and next actions", async () => {
    render(<EmployerDashboard />);
    expect(screen.getByRole("heading", { name: "Attention queue" })).toBeInTheDocument();
    expect(
      await screen.findByRole("table", { name: /active job requisitions/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Grade 6 Science Teacher")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next actions" })).toBeInTheDocument();
  });
});
