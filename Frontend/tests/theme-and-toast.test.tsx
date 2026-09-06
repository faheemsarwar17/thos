import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ToastProvider, useToast } from "@/components/ui/toast-provider";
import { Skeleton, SkeletonText, SkeletonCard } from "@/components/ui/skeleton";

function ToastTestComponent() {
  const { success, error } = useToast();
  return (
    <div>
      <button onClick={() => success("Saved successfully", "Success")}>Trigger Success</button>
      <button onClick={() => error("Failed to load", "Error")}>Trigger Error</button>
    </div>
  );
}

describe("Theme and Toast system", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("toggles theme between light and dark mode", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: /switch to/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    fireEvent.click(button);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("triggers and displays toast notifications with proper live region", () => {
    render(
      <ToastProvider>
        <ToastTestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText("Trigger Success"));
    expect(screen.getByText("Saved successfully")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();

    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("renders shimmer skeletons with accessibility hiding", () => {
    const { container } = render(
      <div>
        <Skeleton width={100} height={20} />
        <SkeletonText lines={2} />
        <SkeletonCard />
      </div>
    );
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });
});
