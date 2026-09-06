import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { PackChip } from "@/components/ui/pack-chip";
import { Pill } from "@/components/ui/pill";

describe("shared UI components", () => {
  it("renders a semantic button with the requested state", () => {
    render(<Button disabled>Publish job</Button>);
    expect(screen.getByRole("button", { name: "Publish job" })).toBeDisabled();
  });

  it("exposes the active domain pack to assistive technology", () => {
    render(<PackChip name="Software Engineering Pack" />);
    expect(screen.getByLabelText("Active domain pack: Software Engineering Pack")).toBeInTheDocument();
  });

  it("pairs status styling with a visible text label", () => {
    render(<Pill tone="attention">SLA at risk</Pill>);
    expect(screen.getByText("SLA at risk")).toHaveClass("pill--attention");
  });
});
