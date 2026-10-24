import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(async () => { throw new (await orig<typeof import("@/lib/api")>()).ApiError(500, "boom", "Server error"); }) },
}));
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

it("never shows fabricated KPI numbers when the API fails", async () => {
  render(<AnalyticsDashboard />);
  expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
  expect(screen.queryByText("18.5")).toBeNull();
  expect(screen.queryByText(/87\.5|92\.4/)).toBeNull();
});
