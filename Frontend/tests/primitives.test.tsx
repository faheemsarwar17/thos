import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/ui/stepper";
import { StatTile } from "@/components/ui/stat-tile";
import { Popover } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tabs } from "@/components/ui/tabs";

describe("PageHeader", () => {
  it("renders one h1, meta and actions", () => {
    render(<PageHeader title="Pipeline" meta="7 candidates" actions={<button>Go</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Pipeline" })).toBeInTheDocument();
    expect(screen.getByText("7 candidates")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });
});

describe("Switch", () => {
  it("is a switch that toggles", () => {
    const Demo = () => { const [on, setOn] = useState(false); return <Switch checked={on} onChange={setOn} label="Blind review" />; };
    render(<Demo />);
    const sw = screen.getByRole("switch", { name: "Blind review" });
    expect(sw).not.toBeChecked();
    fireEvent.click(sw);
    expect(sw).toBeChecked();
  });
});

describe("Stepper", () => {
  it("marks the current step", () => {
    render(<Stepper steps={["Received", "Review", "Interview", "Decision"]} current={2} />);
    expect(screen.getByText("Interview").closest("li")).toHaveAttribute("aria-current", "step");
  });
});

describe("StatTile", () => {
  it("shows label and value", () => {
    render(<StatTile label="In flight" value={7} />);
    expect(screen.getByText("In flight")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});

describe("Popover", () => {
  it("opens, and closes on Escape", () => {
    render(<Popover label="Menu" trigger={({ toggle, open, ref }) => <button ref={ref} aria-expanded={open} onClick={toggle}>Open</button>}><p>Inside</p></Popover>);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("Inside")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Inside")).not.toBeInTheDocument();
  });
});

describe("SegmentedControl", () => {
  it("presses the selected option", () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="View" value="funnel" onChange={onChange} options={[{ value: "funnel", label: "Funnel" }, { value: "board", label: "Board" }]} />);
    expect(screen.getByRole("button", { name: "Funnel" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    expect(onChange).toHaveBeenCalledWith("board");
  });
});

describe("Tabs keyboard", () => {
  it("moves selection with ArrowRight", () => {
    const onChange = vi.fn();
    render(<Tabs tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} activeTab="a" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "A" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
