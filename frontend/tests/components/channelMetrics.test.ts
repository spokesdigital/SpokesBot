import {
  buildClicksCtrData,
  buildConversionRateData,
  buildRevenueCostTrendData,
  buildTransactionsCpaData,
  hasConversionRateData,
  hasTransactionsOrCpaData,
  pickConversionsColumn,
  resolveChartBucket,
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
      { date: "2026-03-17", label: "Mar 17", tooltipLabel: "Mar 17, 2026", transactions: 3, cpa: 30 },
      { date: "2026-03-18", label: "Mar 18", tooltipLabel: "Mar 18, 2026", transactions: 0 },
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
      { date: "2026-03-19", label: "Mar 19", tooltipLabel: "Mar 19, 2026", transactions: 3, cpa: 30 },
      { date: "2026-03-20", label: "Mar 20", tooltipLabel: "Mar 20, 2026", transactions: 0 },
      { date: "2026-03-21", label: "Mar 21", tooltipLabel: "Mar 21, 2026", transactions: 2, cpa: 20 },
      { date: "2026-03-22", label: "Mar 22", tooltipLabel: "Mar 22, 2026", transactions: 0 },
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
      { date: "2026-03-17", label: "Mar 17", tooltipLabel: "Mar 17, 2026", conversionRate: 4 },
      { date: "2026-03-18", label: "Mar 18", tooltipLabel: "Mar 18, 2026", conversionRate: 4 },
    ]);
  });

  it("uses monthly buckets for year-to-date ranges", () => {
    expect(
      buildTransactionsCpaData(
        [
          { date: "2026-01-03", value: 3 },
          { date: "2026-01-20", value: 1 },
          { date: "2026-02-11", value: 2 },
        ],
        [
          { date: "2026-01-03", value: 90 },
          { date: "2026-01-20", value: 30 },
          { date: "2026-02-11", value: 80 },
        ],
        { startDate: "2026-01-01", endDate: "2026-02-28" },
        "ytd",
      ),
    ).toEqual([
      { date: "2026-01-01", label: "Jan 2026", tooltipLabel: "January 2026", transactions: 4, cpa: 30 },
      { date: "2026-02-01", label: "Feb 2026", tooltipLabel: "February 2026", transactions: 2, cpa: 40 },
    ]);
  });

  it("aggregates clicks and CTR into weekly buckets for mid-length custom ranges", () => {
    expect(
      buildClicksCtrData(
        [
          { date: "2026-03-02", value: 20 },
          { date: "2026-03-03", value: 30 },
          { date: "2026-03-10", value: 10 },
        ],
        [
          { date: "2026-03-02", value: 100 },
          { date: "2026-03-03", value: 150 },
          { date: "2026-03-10", value: 50 },
        ],
        { startDate: "2026-03-01", endDate: "2026-05-15" },
        "custom",
      ),
    ).toEqual([
      { date: "2026-02-23", label: "Feb 23", tooltipLabel: "Week of Feb 23, 2026", clicks: 0 },
      { date: "2026-03-02", label: "Mar 2", tooltipLabel: "Week of Mar 2, 2026", clicks: 50, ctr: 20 },
      { date: "2026-03-09", label: "Mar 9", tooltipLabel: "Week of Mar 9, 2026", clicks: 10, ctr: 20 },
      { date: "2026-03-16", label: "Mar 16", tooltipLabel: "Week of Mar 16, 2026", clicks: 0 },
      { date: "2026-03-23", label: "Mar 23", tooltipLabel: "Week of Mar 23, 2026", clicks: 0 },
      { date: "2026-03-30", label: "Mar 30", tooltipLabel: "Week of Mar 30, 2026", clicks: 0 },
      { date: "2026-04-06", label: "Apr 6", tooltipLabel: "Week of Apr 6, 2026", clicks: 0 },
      { date: "2026-04-13", label: "Apr 13", tooltipLabel: "Week of Apr 13, 2026", clicks: 0 },
      { date: "2026-04-20", label: "Apr 20", tooltipLabel: "Week of Apr 20, 2026", clicks: 0 },
      { date: "2026-04-27", label: "Apr 27", tooltipLabel: "Week of Apr 27, 2026", clicks: 0 },
      { date: "2026-05-04", label: "May 4", tooltipLabel: "Week of May 4, 2026", clicks: 0 },
      { date: "2026-05-11", label: "May 11", tooltipLabel: "Week of May 11, 2026", clicks: 0 },
    ]);
  });

  it("builds overview revenue trends at monthly resolution for year-long ranges", () => {
    expect(
      buildRevenueCostTrendData(
        [
          { date: "2026-01-03", value: 100 },
          { date: "2026-01-20", value: 200 },
          { date: "2026-02-11", value: 150 },
        ],
        [
          { date: "2026-01-03", value: 40 },
          { date: "2026-01-20", value: 60 },
          { date: "2026-02-11", value: 70 },
        ],
        { startDate: "2026-01-01", endDate: "2026-12-31" },
        "ytd",
      ),
    ).toEqual([
      { date: "2026-01-01", label: "Jan 2026", tooltipLabel: "January 2026", revenue: 300, cost: 100 },
      { date: "2026-02-01", label: "Feb 2026", tooltipLabel: "February 2026", revenue: 150, cost: 70 },
      { date: "2026-03-01", label: "Mar 2026", tooltipLabel: "March 2026", revenue: 0, cost: 0 },
      { date: "2026-04-01", label: "Apr 2026", tooltipLabel: "April 2026", revenue: 0, cost: 0 },
      { date: "2026-05-01", label: "May 2026", tooltipLabel: "May 2026", revenue: 0, cost: 0 },
      { date: "2026-06-01", label: "Jun 2026", tooltipLabel: "June 2026", revenue: 0, cost: 0 },
      { date: "2026-07-01", label: "Jul 2026", tooltipLabel: "July 2026", revenue: 0, cost: 0 },
      { date: "2026-08-01", label: "Aug 2026", tooltipLabel: "August 2026", revenue: 0, cost: 0 },
      { date: "2026-09-01", label: "Sep 2026", tooltipLabel: "September 2026", revenue: 0, cost: 0 },
      { date: "2026-10-01", label: "Oct 2026", tooltipLabel: "October 2026", revenue: 0, cost: 0 },
      { date: "2026-11-01", label: "Nov 2026", tooltipLabel: "November 2026", revenue: 0, cost: 0 },
      { date: "2026-12-01", label: "Dec 2026", tooltipLabel: "December 2026", revenue: 0, cost: 0 },
    ]);
  });

  it("resolves chart bucket from the selected date range", () => {
    expect(resolveChartBucket("last_7_days", { startDate: "2026-03-01", endDate: "2026-03-07" })).toBe("day");
    expect(resolveChartBucket("custom", { startDate: "2026-03-01", endDate: "2026-05-15" })).toBe("week");
    expect(resolveChartBucket("custom", { startDate: "2026-01-01", endDate: "2026-12-31" })).toBe("month");
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
