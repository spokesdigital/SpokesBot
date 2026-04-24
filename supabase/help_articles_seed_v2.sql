-- Help Articles — comprehensive seed (v2)
-- Run this in Supabase Dashboard → SQL Editor → New query
-- 40 articles across 6 categories: getting_started, dashboards, ai_assistant,
-- data_uploads, troubleshooting, general

-- ─── Getting Started ──────────────────────────────────────────────────────────

INSERT INTO help_articles (title, body, category, sort_order, is_published) VALUES
(
  'How do I log in to the dashboard?',
  'Go to your Spokes Digital dashboard URL and enter the email and password provided by your account manager. If you have trouble logging in, make sure Caps Lock is off and check for any extra spaces in your password. Contact support if you need a password reset.',
  'getting_started', 1, true
),
(
  'How do I change the reporting period?',
  'Use the date selector in the top-right area of the dashboard. You can choose from quick presets like Today, Yesterday, Last 7 Days, Last 30 Days, This Month, YTD, or select All Data to see your entire dataset. You can also pick a Custom Range by entering a specific start and end date.',
  'getting_started', 2, true
),
(
  'How do I switch between Google Ads and Meta Ads?',
  'Use the left-hand sidebar navigation to switch between channels. Click "Google Ads" or "Meta Ads" to load the corresponding dataset and analytics. Each channel has its own set of KPI cards, charts, campaign breakdown, and daily performance table.',
  'getting_started', 3, true
),
(
  'What is the "All Data" date option?',
  'Selecting "All Data" from the date filter removes all date restrictions and loads every row in your dataset. This is useful when you want to see the full historical picture or when your dataset covers a specific campaign period that does not align with calendar presets.',
  'getting_started', 4, true
),
(
  'How do I navigate between different sections of the dashboard?',
  'The left sidebar contains all main navigation links including Overview, Google Ads, Meta Ads, and Help. On mobile, tap the hamburger menu icon at the top-left to open the navigation panel. The sidebar can be collapsed on desktop by clicking the collapse arrow to give more screen space to the charts.',
  'getting_started', 5, true
),
(
  'Can multiple users access the same dashboard?',
  'Yes. Each user has their own login credentials. Your Spokes Digital account manager can provision access for team members. Admin users can also manage multiple client organisations from a single admin panel.',
  'getting_started', 6, true
),
(
  'What browsers are supported?',
  'The dashboard works best on the latest versions of Chrome, Edge, Firefox, and Safari. For the smoothest experience with charts and scrolling, we recommend Chrome or Edge on a desktop or laptop screen.',
  'getting_started', 7, true
),

-- ─── Dashboards ───────────────────────────────────────────────────────────────

(
  'What does ROAS mean and how is it calculated?',
  'ROAS stands for Return On Ad Spend. It is calculated as Revenue ÷ Cost. A ROAS of 4.00x means you earned $4 in revenue for every $1 spent on advertising. Higher ROAS indicates more efficient ad spend. Industry benchmarks vary widely by category, but 3–5x is a common healthy range for e-commerce.',
  'dashboards', 1, true
),
(
  'What does CTR mean and why does it matter?',
  'CTR stands for Click-Through Rate — the percentage of people who saw your ad and clicked on it. It is calculated as Clicks ÷ Impressions × 100. A higher CTR means your ad creative and targeting are resonating with the audience. Low CTR can indicate poor relevance, weak creative, or mismatched targeting.',
  'dashboards', 2, true
),
(
  'What is CPC and what affects it?',
  'CPC stands for Cost Per Click — the average amount you paid each time someone clicked your ad. It is calculated as Total Cost ÷ Total Clicks. CPC is influenced by competition in your ad auction, Quality Score (Google) or Relevance Score (Meta), bid strategy, and audience targeting. Lowering CPC while maintaining CTR improves overall efficiency.',
  'dashboards', 3, true
),
(
  'What does the Revenue vs Cost trend chart show?',
  'The Revenue vs Cost chart plots both metrics over time as area charts, letting you visually track the gap between what you earn and what you spend. When the revenue area is consistently above the cost area, your campaigns are profitable. Narrowing gaps may indicate rising costs or falling returns.',
  'dashboards', 4, true
),
(
  'What is the Campaign Breakdown table?',
  'The Campaign Breakdown table shows performance metrics grouped by your top-level campaign (or ad group / ad set if that is the most granular dimension in your dataset). Each row shows Impressions, Clicks, Cost, Revenue, Conversions, CTR, CPC, ROAS, and ATV for that campaign. You can sort any column by clicking its header.',
  'dashboards', 5, true
),
(
  'What is Average Transaction Value (ATV)?',
  'ATV (Average Transaction Value) represents the average revenue generated per conversion. It is calculated as Revenue ÷ Conversions. A rising ATV indicates customers are buying higher-value items or more items per order, which is generally a strong signal even when conversion volume is flat.',
  'dashboards', 6, true
),
(
  'How do I zoom in on a specific time period in the charts?',
  'Each chart has zoom controls (+ and −) in a pill at the bottom of the chart. Click the + button to zoom in and focus on the most recent portion of the data. Click − to zoom back out. You can also horizontally scroll within any chart when viewing large date ranges like 90 days.',
  'dashboards', 7, true
),
(
  'Why can I scroll horizontally in the charts?',
  'When your data covers many days, the charts expand to give each data point adequate space so bars and lines are never squished together. Scroll left or right within the chart to navigate the full timeline. A thin scrollbar appears at the bottom of the chart area during scrolling.',
  'dashboards', 8, true
),
(
  'What does the Daily Performance table show?',
  'The Daily Performance table breaks down every metric by individual day — Impressions, Clicks, Cost, Revenue, Conversions, CTR, CPC, ROAS, and ATV. You can sort by any column and scroll vertically to browse all days. Pagination controls at the bottom let you navigate through 30 rows at a time.',
  'dashboards', 9, true
),
(
  'What does the Clicks vs CTR chart show?',
  'This dual-axis chart plots the number of clicks as bars (left axis) and the CTR percentage as a line (right axis). It helps you understand whether click volume changes are driven by audience size (impressions) or ad quality (CTR). Rising bars with a flat or rising line is the ideal pattern.',
  'dashboards', 10, true
),
(
  'What does the Clicks vs Avg CPC chart show?',
  'This chart overlays click volume with average CPC over time. It helps you identify periods where you paid more per click and whether that correlated with higher or lower traffic. Rising CPC alongside rising clicks can indicate competitive pressure in the auction.',
  'dashboards', 11, true
),
(
  'What is the Revenue Distribution pie chart?',
  'The Revenue Distribution chart shows the share of total revenue contributed by your top 5 campaigns. The remainder is grouped as "Other". This lets you quickly spot which campaigns are driving the most value and which may be underperforming relative to their budget share.',
  'dashboards', 12, true
),
(
  'What does the Transactions vs CPA chart show?',
  'This chart plots conversion (transaction) volume alongside Cost Per Acquisition (CPA). CPA is calculated as Cost ÷ Conversions. The ideal pattern is high transactions with falling CPA. A rising CPA with falling transactions is a warning sign that campaigns are becoming less efficient.',
  'dashboards', 13, true
),
(
  'How is Conversion Rate calculated?',
  'Conversion Rate is the percentage of clicks that result in a conversion: Conversions ÷ Clicks × 100. A 2% conversion rate means 2 out of every 100 ad clicks resulted in a purchase or desired action. Improving landing page quality, offer relevance, and checkout flow typically raises conversion rate.',
  'dashboards', 14, true
),
(
  'What does the "Group by" dropdown in Campaign Breakdown do?',
  'If your dataset contains multiple campaign dimension columns (e.g. both Campaign and Ad Set), the "Group by" dropdown lets you choose which level to view. Grouping by Campaign gives a high-level view; switching to Ad Set or Ad Name drills down to more granular performance.',
  'dashboards', 15, true
),
(
  'How are KPI card delta percentages calculated?',
  'Each KPI card compares the current period to an equivalent prior period of the same length. For example, Last 7 Days compares this week to the previous week. A green delta means improvement; red means decline. For cost-based metrics (Cost, CPC), a positive delta is shown in red because higher cost is unfavourable.',
  'dashboards', 16, true
),

-- ─── AI Assistant ─────────────────────────────────────────────────────────────

(
  'What can I ask SpokesBot?',
  'SpokesBot is your AI data analyst. You can ask it about any metric in your current dataset — for example: "What was my total spend last week?", "Which campaign had the highest ROAS?", "Compare delivery vs in-store revenue", or "Predict my ROAS next month based on current trends." It reads your actual data and responds with specific numbers.',
  'ai_assistant', 1, true
),
(
  'How do I open the AI chat widget?',
  'Click the gold pulsing button in the bottom-right corner of any dashboard page. The chat panel will slide open. Type your question and press Enter or click the send button. SpokesBot streams its answer back to you in real time.',
  'ai_assistant', 2, true
),
(
  'Can SpokesBot predict future performance?',
  'Yes. SpokesBot can produce trend-based projections. Ask something like "What will my ROAS be next month?" or "Predict revenue for the next 30 days based on current data." It calculates your current daily or weekly average and extrapolates forward, clearly labelling the result as an estimate based on existing trends.',
  'ai_assistant', 3, true
),
(
  'What does "ROI" mean when I ask SpokesBot about it?',
  'SpokesBot maps "ROI" and "return on investment" to your ROAS metric (Revenue ÷ Cost) or, if that column is absent, to Revenue and Cost separately. You can freely use the terms ROI, ROAS, return, or efficiency — SpokesBot understands they refer to the same concept in an ad context.',
  'ai_assistant', 4, true
),
(
  'Can SpokesBot compare two campaigns or channels?',
  'Yes. Ask something like "Compare Branded Search vs Non-Branded revenue" or "How does campaign A perform vs campaign B on ROAS?" SpokesBot will find the matching rows in your dataset, compute the relevant metric for each, and present a comparison table with a chart if helpful.',
  'ai_assistant', 5, true
),
(
  'Why does SpokesBot sometimes ask for clarification?',
  'SpokesBot always reads your actual dataset schema before answering, so it knows exactly which columns are available. If it asks for clarification, it usually means your question referenced a metric or campaign name that does not closely match a column in your data — rephrasing with the exact column name or metric from the dashboard usually resolves this.',
  'ai_assistant', 6, true
),
(
  'Does SpokesBot remember previous questions in a conversation?',
  'Yes, within the same chat session SpokesBot maintains conversation history so you can ask follow-up questions like "Now show me that for last month instead." Each new session starts fresh. The conversation history is saved so you can scroll back through past answers within a session.',
  'ai_assistant', 7, true
),
(
  'How accurate are SpokesBot answers?',
  'Every answer SpokesBot gives is validated by an internal critic that cross-checks the numbers against your raw dataset before streaming the response. If a number cannot be verified, SpokesBot is instructed to recalculate rather than guess. For forecasts and projections, the answer is clearly labelled as an estimate.',
  'ai_assistant', 8, true
),
(
  'What types of charts can SpokesBot generate?',
  'SpokesBot can generate bar charts and line charts inline within the chat. These appear automatically when a comparison or trend is best understood visually. You cannot currently request a specific chart type — SpokesBot selects the most appropriate one based on your question.',
  'ai_assistant', 9, true
),
(
  'Can I ask SpokesBot about a specific date range?',
  'Yes. You can mention time periods directly in your question, for example: "What was my CTR last week?", "Show me revenue for the last 30 days", or "Compare this month vs last month spend." SpokesBot will filter your dataset to the requested period and return metrics for that window.',
  'ai_assistant', 10, true
),

-- ─── Data Uploads ─────────────────────────────────────────────────────────────

(
  'What file format is required for data uploads?',
  'All uploads must be CSV files (comma-separated values). Each row should represent one day or one campaign-day combination. The file should have a header row with clear column names. Common exports from Google Ads, Meta Ads Manager, or any analytics platform are typically compatible.',
  'data_uploads', 1, true
),
(
  'What columns should my CSV include?',
  'The dashboard automatically detects your columns, but for the best experience include: a date column (named "Date", "Day", or "Timestamp"), a campaign name column, and numeric metric columns such as Impressions, Clicks, Cost/Spend, Revenue/Conversion Value, and Conversions/Transactions. Additional columns are shown where relevant.',
  'data_uploads', 2, true
),
(
  'How do I upload a new dataset?',
  'Go to the dataset upload page (accessible from the sidebar or the admin panel). Click the upload area or drag and drop your CSV file. The system will parse the file, detect columns, and map metrics automatically. Review the column mapping preview before confirming the upload.',
  'data_uploads', 3, true
),
(
  'Can I upload data for both Google Ads and Meta Ads?',
  'Yes. Upload separate CSV files for each channel. When uploading, assign the dataset to the correct channel (Google Ads or Meta Ads). Each channel maintains its own datasets and the dashboard automatically routes to the correct one based on the active channel view.',
  'data_uploads', 4, true
),
(
  'How often should I upload new data?',
  'This depends on your reporting cadence. Most clients upload weekly or monthly exports from their ad platforms. For the most current view, upload whenever you receive a fresh export from Google Ads or Meta Ads Manager. Future versions will support automated data connections.',
  'data_uploads', 5, true
),
(
  'What date formats are accepted in the CSV?',
  'The dashboard accepts ISO format (YYYY-MM-DD, e.g. 2024-04-15), US format (MM/DD/YYYY), UK format (DD/MM/YYYY), and common named formats (e.g. "Apr 15, 2024"). For best results, use YYYY-MM-DD as it is unambiguous and universally compatible.',
  'data_uploads', 6, true
),
(
  'What happens if my CSV has extra or unexpected columns?',
  'Extra columns are imported alongside the standard ones. The dashboard will attempt to map known metric names automatically. Any columns it cannot recognise are still stored and can be referenced by SpokesBot when you ask about them by name.',
  'data_uploads', 7, true
),
(
  'Can I replace an existing dataset with a newer version?',
  'Yes. You can upload a new file and assign it to replace a previous dataset for the same channel and period. The previous dataset remains in your history until explicitly deleted. When you switch to the new dataset, all charts and metrics will reflect the updated data.',
  'data_uploads', 8, true
),

-- ─── Troubleshooting ──────────────────────────────────────────────────────────

(
  'Why are some KPI cards showing dashes or zeros?',
  'A dash or zero typically means the required column was not found in your uploaded dataset, or the column exists but has no data for the selected date range. Check that your CSV includes columns for the metric in question (e.g. Revenue, Cost, Clicks) and that the date filter is not excluding all rows.',
  'troubleshooting', 1, true
),
(
  'Why does the Campaign Breakdown table appear empty?',
  'The Campaign Breakdown table requires a campaign name column in your dataset. If the table is empty, your CSV may be missing a column with "campaign" in its name. It can also appear empty if the selected date range returns no data — try switching to "All Data" to verify.',
  'troubleshooting', 2, true
),
(
  'Why are the charts not rendering any data?',
  'Charts need both a date column and at least one numeric metric column. If either is missing or the date column has an unrecognised format, the charts will be blank. Try switching the date filter to "All Data" and verify that your CSV has a properly formatted date column.',
  'troubleshooting', 3, true
),
(
  'The dashboard is loading slowly — what should I do?',
  'Slow load times are most common with very large datasets or weak internet connections. Try refreshing the page. If you are on "All Data" with a very large file, switching to a shorter date range like Last 30 Days can significantly speed up chart rendering.',
  'troubleshooting', 4, true
),
(
  'SpokesBot is not responding — what should I do?',
  'If SpokesBot stops responding mid-answer, it may have hit a timeout on a complex query. Close and reopen the chat widget, then try rephrasing your question more specifically. If the issue persists, try refreshing the page. Complex questions over very large datasets can occasionally time out.',
  'troubleshooting', 5, true
),
(
  'My ROAS looks incorrect — why might that be?',
  'ROAS is calculated as Revenue ÷ Cost. If either column is mapped incorrectly (e.g. a conversion count column mistakenly mapped as Revenue), the result will be wrong. Check the column names in your CSV and make sure "Revenue" or "Conversion Value" contains currency values, not counts.',
  'troubleshooting', 6, true
),
(
  'Why does my CTR show as a very small decimal instead of a percentage?',
  'Some ad platform exports provide CTR as a ratio (e.g. 0.0345) rather than a percentage (3.45%). The dashboard automatically detects this and displays CTR values correctly with a % symbol. If it still looks wrong, check your CSV to see how CTR is stored in the file.',
  'troubleshooting', 7, true
),
(
  'I uploaded a new file but the dashboard still shows old data — why?',
  'After uploading, make sure you select the newly uploaded dataset from the dataset selector at the top of the channel page. The dashboard does not automatically switch to the newest dataset — you need to select it to activate it.',
  'troubleshooting', 8, true
),
(
  'Why is the daily breakdown only showing a few days?',
  'The Daily Performance table respects the active date filter. If you have "This Month" selected and it is early in the month, only the days elapsed so far will appear. Switch to "All Data" or a longer preset like "Last 30 Days" to see more rows.',
  'troubleshooting', 9, true
),
(
  'Can I export the data I see in the dashboard?',
  'The dashboard does not currently have a built-in CSV export for chart data. However, you can ask SpokesBot to summarise any metric for any period and copy the answer. For full raw data exports, use your original ad platform (Google Ads or Meta Ads Manager).',
  'troubleshooting', 10, true
)
;
