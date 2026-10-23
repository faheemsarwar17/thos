import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("applicationId=app_1"),
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/pipeline",
}));
vi.mock("@/components/pipeline/application-drawer", () => ({
  ApplicationDrawer: ({ applicationId }: { applicationId: string | null }) => (applicationId ? <div role="dialog" aria-label="Application">{applicationId}</div> : null),
}));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(async (p: string) => (p.includes("pipeline") ? { columns: [] } : { postings: [] })), post: vi.fn() },
}));

import { PipelinePage } from "@/components/pipeline/pipeline-page";
import { ToastProvider } from "@/components/ui/toast-provider";

it("opens the application drawer from ?applicationId", async () => {
  render(<ToastProvider><PipelinePage /></ToastProvider>);
  expect(await screen.findByRole("dialog", { name: "Application" })).toHaveTextContent("app_1");
});
