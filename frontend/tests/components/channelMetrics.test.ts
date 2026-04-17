import {
  buildConversionRateData,
  buildTransactionsCpaData,
  hasConversionRateData,
  hasTransactionsOrCpaData,
  pickConversionsColumn,
} from "@/components/dashboard/channelMetrics";

describe("channelMetrics", () => {
  it("prefers the explicit stored conversions mapping when present", () => {
    expect(
      pickConversionsColumn(
        { conversions: "Purchases" },
        ["Conversion Rate", "Purchases", "Cost per Conversion"],
      ),
    ).toBe("Purchases");
  });

  it("returns null when no verified conversions mapping exists", () => {
    expect(
      pickConversionsColumn(
        {},
        ["Conversion Rate", "Cost per Conversion", "All Conversions", "Transactions"],
      ),
    ).toBeNull();
  });

  it("computes CPA only when transactions are positive", () => {
    expect(
      buildTransactionsCpaData(
        [
          { date: "2026-03-17", value: 3 },
          { date: "2026-03-18", value: 0 },
        ],
        [
          { date: "2026-03-17", value: 90 },
          { date: "2026-03-18", value: 45 },
        ],
      ),
    ).toEqual([
      { date: "2026-03-17", transactions: 3, cpa: 30 },
      { date: "2026-03-18", transactions: 0 },
    ]);
  });

  it("fills every day in the selected range for transactions vs CPA", () => {
    expect(
      buildTransactionsCpaData(
        [
          { date: "2026-03-19", value: 3 },
          { date: "2026-03-21", value: 2 },
        ],
        [
          { date: "2026-03-19", value: 90 },
          { date: "2026-03-21", value: 40 },
        ],
        { startDate: "2026-03-19", endDate: "2026-03-22" },
      ),
    ).toEqual([
      { date: "2026-03-19", transactions: 3, cpa: 30 },
      { date: "2026-03-20", transactions: 0 },
      { date: "2026-03-21", transactions: 2, cpa: 20 },
      { date: "2026-03-22", transactions: 0 },
    ]);
  });

  it("computes conversion rate from daily conversions and clicks", () => {
    expect(
      buildConversionRateData(
        [
          { date: "2026-03-17", value: 2 },
          { date: "2026-03-18", value: 1 },
        ],
        [
          { date: "2026-03-17", value: 50 },
          { date: "2026-03-18", value: 25 },
        ],
      ),
    ).toEqual([
      { date: "2026-03-17", conversionRate: 4 },
      { date: "2026-03-18", conversionRate: 4 },
    ]);
  });

  it("reports chart emptiness from actual plotted values instead of raw row count", () => {
    expect(
      hasTransactionsOrCpaData([
        { date: "2026-03-17" },
        { date: "2026-03-18" },
      ]),
    ).toBe(false);

    expect(
      hasTransactionsOrCpaData([
        { date: "2026-03-17", transactions: 0 },
        { date: "2026-03-18", transactions: 0 },
      ]),
    ).toBe(false);

    expect(
      hasTransactionsOrCpaData([
        { date: "2026-03-17", transactions: 3 },
      ]),
    ).toBe(true);

    expect(
      hasConversionRateData([
        { date: "2026-03-17" },
        { date: "2026-03-18", conversionRate: 2.5 },
      ]),
    ).toBe(true);
  });

  it("returns no transactions chart data when a required metric series is missing", () => {
    expect(
      buildTransactionsCpaData(
        [],
        [{ date: "2026-03-17", value: 90 }],
        { startDate: "2026-03-17", endDate: "2026-03-18" },
      ),
    ).toEqual([]);
  });
});
