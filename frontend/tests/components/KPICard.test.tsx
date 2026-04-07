import { render, screen } from "@testing-library/react";
import { KPICard } from "@/components/dashboard/KPICard";

const MockIcon = () => <svg data-testid="icon" />;

describe("KPICard", () => {
  it("renders the label and value", () => {
    render(<KPICard label="Total Rows" value={1234} icon={<MockIcon />} />);

    expect(screen.getByText("Total Rows")).toBeInTheDocument();
    expect(screen.getByText("1234")).toBeInTheDocument();
  });

  it("renders the icon", () => {
    render(<KPICard label="Datasets" value={5} icon={<MockIcon />} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders the optional subtitle when provided", () => {
    render(
      <KPICard
        label="Sessions"
        value={99}
        icon={<MockIcon />}
        subtitle="last 7 days"
      />
    );
    expect(screen.getByText("last 7 days")).toBeInTheDocument();
  });

  it("omits the subtitle when not provided", () => {
    render(<KPICard label="Sessions" value={0} icon={<MockIcon />} />);
    expect(screen.queryByText("last 7 days")).not.toBeInTheDocument();
  });

  it("defaults to the emerald color scheme", () => {
    const { container } = render(
      <KPICard label="x" value="y" icon={<MockIcon />} />
    );
    // The root panel should carry the emerald background class
    expect(container.firstChild).toHaveClass("bg-emerald-100/70");
  });

  it("applies the correct color classes for the amber variant", () => {
    const { container } = render(
      <KPICard label="x" value="y" icon={<MockIcon />} color="amber" />
    );
    expect(container.firstChild).toHaveClass("bg-amber-100/75");
  });
});
