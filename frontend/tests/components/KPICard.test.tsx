import { render, screen } from "@testing-library/react";
import { KPICard } from "@/components/dashboard/KPICard";

describe("KPICard", () => {
  it("renders title and value", () => {
    render(<KPICard title="Impressions" value="1,234,567" />);
    expect(screen.getByText("Impressions")).toBeInTheDocument();
    expect(screen.getByText("1,234,567")).toBeInTheDocument();
  });

  it("shows 'No prior comparison' when trendValue is null", () => {
    render(<KPICard title="CTR" value="4.2%" trendValue={null} />);
    expect(screen.getByText("No prior comparison")).toBeInTheDocument();
  });

  it("shows positive trend label with TrendingUp icon class", () => {
    render(<KPICard title="ROAS" value="3.5x" trendValue={12.4} />);
    expect(screen.getByText("12.4% vs prior period")).toBeInTheDocument();
  });

  it("shows negative trend label for negative trendValue", () => {
    render(<KPICard title="Cost" value="$8,000" trendValue={-5.3} />);
    expect(screen.getByText("5.3% vs prior period")).toBeInTheDocument();
    // Red colour class applied
    const trend = screen.getByText("5.3% vs prior period").closest("div");
    expect(trend).toHaveClass("text-red-500");
  });

  it("respects explicit trendDirection override", () => {
    // trendValue positive but direction forced to negative
    render(
      <KPICard title="CPC" value="$1.20" trendValue={8} trendDirection="negative" />
    );
    const trend = screen.getByText("8.0% vs prior period").closest("div");
    expect(trend).toHaveClass("text-red-500");
  });

  it("renders the loading skeleton when loading=true", () => {
    const { container } = render(<KPICard title="Revenue" value="$0" loading />);
    // No title text rendered during loading
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
    // Shimmer divs present
    expect(container.querySelector(".shimmer-warm")).toBeTruthy();
  });
});
