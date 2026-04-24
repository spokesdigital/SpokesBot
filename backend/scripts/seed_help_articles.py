"""
Seed help articles via the backend API.

Usage (from repo root, with backend running):
  python backend/scripts/seed_help_articles.py \
      --api-url https://your-backend.onrender.com \
      --token <admin_access_token>

Get your admin access token from the browser:
  1. Log in to the dashboard as an admin
  2. Open DevTools → Application → Local Storage → look for the Supabase auth key
  3. Copy the access_token value
"""

from __future__ import annotations

import argparse
import json
import sys

try:
    import httpx
except ImportError:
    print("httpx not installed. Run: pip install httpx")
    sys.exit(1)

ARTICLES: list[dict] = [
    # ── Getting Started ──────────────────────────────────────────────────────
    {
        "title": "How do I log in to the dashboard?",
        "body": "Go to your Spokes Digital dashboard URL and enter the email and password provided by your account manager. If you have trouble logging in, make sure Caps Lock is off and check for any extra spaces in your password. Contact support if you need a password reset.",
        "category": "getting_started",
        "sort_order": 1,
        "is_published": True,
    },
    {
        "title": "How do I change the reporting period?",
        "body": "Use the date selector in the top-right area of the dashboard. Choose from presets like Today, Yesterday, Last 7 Days, Last 30 Days, This Month, YTD, or All Data. You can also set a Custom Range by entering a specific start and end date.",
        "category": "getting_started",
        "sort_order": 2,
        "is_published": True,
    },
    {
        "title": "How do I switch between Google Ads and Meta Ads?",
        "body": "Use the left-hand sidebar navigation to switch between channels. Click 'Google Ads' or 'Meta Ads' to load the corresponding dataset and analytics. Each channel has its own KPI cards, charts, campaign breakdown, and daily performance table.",
        "category": "getting_started",
        "sort_order": 3,
        "is_published": True,
    },
    {
        "title": "What is the 'All Data' date option?",
        "body": "Selecting 'All Data' from the date filter removes all date restrictions and loads every row in your dataset. This is useful when you want to see the full historical picture or when your dataset covers a specific campaign period that does not align with calendar presets.",
        "category": "getting_started",
        "sort_order": 4,
        "is_published": True,
    },
    {
        "title": "How do I navigate between different sections?",
        "body": "The left sidebar contains all main navigation links including Overview, Google Ads, Meta Ads, and Help. On mobile, tap the hamburger menu icon at the top-left to open the navigation panel. The sidebar can be collapsed on desktop by clicking the collapse arrow.",
        "category": "getting_started",
        "sort_order": 5,
        "is_published": True,
    },
    {
        "title": "Can multiple users access the same dashboard?",
        "body": "Yes. Each user has their own login credentials. Your Spokes Digital account manager can provision access for team members. Admin users can also manage multiple client organisations from a single admin panel.",
        "category": "getting_started",
        "sort_order": 6,
        "is_published": True,
    },
    {
        "title": "What browsers are supported?",
        "body": "The dashboard works best on the latest versions of Chrome, Edge, Firefox, and Safari. For the smoothest experience with charts and scrolling, we recommend Chrome or Edge on a desktop or laptop screen.",
        "category": "getting_started",
        "sort_order": 7,
        "is_published": True,
    },
    # ── Dashboards ───────────────────────────────────────────────────────────
    {
        "title": "What does ROAS mean and how is it calculated?",
        "body": "ROAS stands for Return On Ad Spend. It is calculated as Revenue ÷ Cost. A ROAS of 4.00x means you earned $4 in revenue for every $1 spent on advertising. Higher ROAS indicates more efficient ad spend. Industry benchmarks vary widely, but 3–5x is a common healthy range for e-commerce.",
        "category": "dashboards",
        "sort_order": 1,
        "is_published": True,
    },
    {
        "title": "What does CTR mean and why does it matter?",
        "body": "CTR stands for Click-Through Rate — the percentage of people who saw your ad and clicked on it (Clicks ÷ Impressions × 100). A higher CTR means your ad creative and targeting are resonating. Low CTR can indicate poor relevance, weak creative, or mismatched targeting.",
        "category": "dashboards",
        "sort_order": 2,
        "is_published": True,
    },
    {
        "title": "What is CPC and what affects it?",
        "body": "CPC stands for Cost Per Click — the average amount paid each time someone clicked your ad (Total Cost ÷ Total Clicks). CPC is influenced by auction competition, Quality Score, bid strategy, and audience targeting. Lowering CPC while maintaining CTR improves overall efficiency.",
        "category": "dashboards",
        "sort_order": 3,
        "is_published": True,
    },
    {
        "title": "What does the Revenue vs Cost trend chart show?",
        "body": "This chart plots both metrics over time as area charts so you can track the gap between earnings and spend. When the revenue area is consistently above cost, campaigns are profitable. Narrowing gaps may indicate rising costs or falling returns.",
        "category": "dashboards",
        "sort_order": 4,
        "is_published": True,
    },
    {
        "title": "What is the Campaign Breakdown table?",
        "body": "The Campaign Breakdown table shows performance metrics grouped by campaign (or ad group / ad set). Each row shows Impressions, Clicks, Cost, Revenue, Conversions, CTR, CPC, ROAS, and ATV. Click any column header to sort by that metric.",
        "category": "dashboards",
        "sort_order": 5,
        "is_published": True,
    },
    {
        "title": "What is Average Transaction Value (ATV)?",
        "body": "ATV represents the average revenue generated per conversion (Revenue ÷ Conversions). A rising ATV indicates customers are buying higher-value items or more per order, which is a strong signal even when conversion volume is flat.",
        "category": "dashboards",
        "sort_order": 6,
        "is_published": True,
    },
    {
        "title": "How do I zoom in on a specific time period in the charts?",
        "body": "Each chart has zoom controls (+ and −) in a pill at the bottom. Click + to zoom in and − to zoom back out. You can also horizontally scroll within any chart when viewing large date ranges like 90 days, since each point is given a fixed minimum width.",
        "category": "dashboards",
        "sort_order": 7,
        "is_published": True,
    },
    {
        "title": "Why can I scroll horizontally in the charts?",
        "body": "When data covers many days, charts expand to give each point adequate space so bars and lines are never squished. Scroll left or right within the chart to navigate the full timeline. A thin scrollbar appears at the bottom of the chart area during scrolling.",
        "category": "dashboards",
        "sort_order": 8,
        "is_published": True,
    },
    {
        "title": "What does the Daily Performance table show?",
        "body": "The Daily Performance table breaks down every metric by individual day — Impressions, Clicks, Cost, Revenue, Conversions, CTR, CPC, ROAS, and ATV. Sort by any column and scroll vertically to browse all days. Pagination controls navigate 30 rows at a time.",
        "category": "dashboards",
        "sort_order": 9,
        "is_published": True,
    },
    {
        "title": "What does the Clicks vs CTR chart show?",
        "body": "This dual-axis chart plots click volume as bars (left axis) and CTR as a line (right axis). It helps you understand whether click changes are driven by audience size (impressions) or ad quality (CTR). Rising bars with flat or rising CTR is the ideal pattern.",
        "category": "dashboards",
        "sort_order": 10,
        "is_published": True,
    },
    {
        "title": "What does the Clicks vs Avg CPC chart show?",
        "body": "This chart overlays click volume with average CPC over time, helping you identify periods where you paid more per click and whether that correlated with higher or lower traffic. Rising CPC alongside rising clicks can indicate competitive auction pressure.",
        "category": "dashboards",
        "sort_order": 11,
        "is_published": True,
    },
    {
        "title": "What is the Revenue Distribution pie chart?",
        "body": "The Revenue Distribution chart shows the share of total revenue contributed by your top 5 campaigns. The remainder is grouped as 'Other'. This lets you quickly spot which campaigns drive the most value and which may be underperforming relative to their budget share.",
        "category": "dashboards",
        "sort_order": 12,
        "is_published": True,
    },
    {
        "title": "What does the Transactions vs CPA chart show?",
        "body": "This chart plots conversion volume alongside Cost Per Acquisition (CPA = Cost ÷ Conversions). The ideal pattern is high transactions with falling CPA. Rising CPA with falling transactions warns that campaigns are becoming less efficient.",
        "category": "dashboards",
        "sort_order": 13,
        "is_published": True,
    },
    {
        "title": "How is Conversion Rate calculated?",
        "body": "Conversion Rate is the percentage of clicks that result in a conversion: Conversions ÷ Clicks × 100. A 2% rate means 2 out of 100 ad clicks converted. Improving landing page quality, offer relevance, and checkout flow typically raises this metric.",
        "category": "dashboards",
        "sort_order": 14,
        "is_published": True,
    },
    {
        "title": "What does the 'Group by' dropdown in Campaign Breakdown do?",
        "body": "If your dataset has multiple campaign dimension columns (e.g. Campaign and Ad Set), this dropdown lets you choose which level to view. Grouping by Campaign gives a high-level view; switching to Ad Set or Ad Name drills down to more granular performance.",
        "category": "dashboards",
        "sort_order": 15,
        "is_published": True,
    },
    {
        "title": "How are KPI card delta percentages calculated?",
        "body": "Each KPI card compares the current period to an equivalent prior period of the same length. For example, Last 7 Days compares this week to the previous week. Green = improvement; red = decline. For cost metrics (Cost, CPC), a positive delta shows in red because higher cost is unfavourable.",
        "category": "dashboards",
        "sort_order": 16,
        "is_published": True,
    },
    # ── AI Assistant ─────────────────────────────────────────────────────────
    {
        "title": "What can I ask SpokesBot?",
        "body": "SpokesBot is your AI data analyst. Ask it about any metric in your dataset — for example: 'What was my total spend last week?', 'Which campaign had the highest ROAS?', 'Compare delivery vs in-store revenue', or 'Predict my ROAS next month based on current trends.'",
        "category": "ai_assistant",
        "sort_order": 1,
        "is_published": True,
    },
    {
        "title": "How do I open the AI chat widget?",
        "body": "Click the gold pulsing button in the bottom-right corner of any dashboard page. The chat panel slides open. Type your question and press Enter or click the send button. SpokesBot streams its answer back in real time.",
        "category": "ai_assistant",
        "sort_order": 2,
        "is_published": True,
    },
    {
        "title": "Can SpokesBot predict future performance?",
        "body": "Yes. SpokesBot can produce trend-based projections. Ask 'What will my ROAS be next month?' or 'Predict revenue for the next 30 days based on current data.' It calculates your current daily average and extrapolates forward, clearly labelling the result as an estimate.",
        "category": "ai_assistant",
        "sort_order": 3,
        "is_published": True,
    },
    {
        "title": "What does 'ROI' mean when I ask SpokesBot about it?",
        "body": "SpokesBot maps 'ROI' and 'return on investment' to your ROAS metric (Revenue ÷ Cost) or, if that column is absent, to Revenue and Cost separately. You can freely use ROI, ROAS, return, or efficiency — SpokesBot understands they refer to the same concept in an ad context.",
        "category": "ai_assistant",
        "sort_order": 4,
        "is_published": True,
    },
    {
        "title": "Can SpokesBot compare two campaigns or channels?",
        "body": "Yes. Ask 'Compare Branded Search vs Non-Branded revenue' or 'How does campaign A perform vs campaign B on ROAS?' SpokesBot will find the matching rows in your dataset, compute the metric for each, and present a comparison table with a chart if helpful.",
        "category": "ai_assistant",
        "sort_order": 5,
        "is_published": True,
    },
    {
        "title": "Does SpokesBot remember previous questions in a conversation?",
        "body": "Yes, within the same chat session SpokesBot maintains conversation history so you can ask follow-ups like 'Now show me that for last month instead.' Each new session starts fresh. You can scroll back through past answers within a session.",
        "category": "ai_assistant",
        "sort_order": 6,
        "is_published": True,
    },
    {
        "title": "How accurate are SpokesBot answers?",
        "body": "Every answer is validated by an internal critic that cross-checks numbers against your raw dataset before streaming the response. If a number cannot be verified, SpokesBot recalculates rather than guesses. Forecasts and projections are clearly labelled as estimates.",
        "category": "ai_assistant",
        "sort_order": 7,
        "is_published": True,
    },
    {
        "title": "Can I ask SpokesBot about a specific date range?",
        "body": "Yes. Mention time periods directly in your question — 'What was my CTR last week?', 'Show me revenue for the last 30 days', or 'Compare this month vs last month spend.' SpokesBot filters your dataset to the requested period and returns metrics for that window.",
        "category": "ai_assistant",
        "sort_order": 8,
        "is_published": True,
    },
    {
        "title": "What types of charts can SpokesBot generate?",
        "body": "SpokesBot can generate bar charts and line charts inline within the chat. These appear automatically when a comparison or trend is best understood visually. SpokesBot selects the most appropriate chart type based on the nature of your question.",
        "category": "ai_assistant",
        "sort_order": 9,
        "is_published": True,
    },
    # ── Data Uploads ─────────────────────────────────────────────────────────
    {
        "title": "What file format is required for data uploads?",
        "body": "All uploads must be CSV files (comma-separated values). Each row should represent one day or one campaign-day combination. The file should have a header row with clear column names. Standard exports from Google Ads, Meta Ads Manager, or any analytics platform are typically compatible.",
        "category": "data_uploads",
        "sort_order": 1,
        "is_published": True,
    },
    {
        "title": "What columns should my CSV include?",
        "body": "For the best experience include: a date column (named Date, Day, or Timestamp), a campaign name column, and numeric columns such as Impressions, Clicks, Cost/Spend, Revenue/Conversion Value, and Conversions/Transactions. Additional columns are stored and accessible via SpokesBot.",
        "category": "data_uploads",
        "sort_order": 2,
        "is_published": True,
    },
    {
        "title": "How do I upload a new dataset?",
        "body": "Go to the dataset upload page accessible from the sidebar or admin panel. Click the upload area or drag and drop your CSV file. The system parses the file, detects columns, and maps metrics automatically. Review the column mapping preview before confirming the upload.",
        "category": "data_uploads",
        "sort_order": 3,
        "is_published": True,
    },
    {
        "title": "What date formats are accepted in the CSV?",
        "body": "The dashboard accepts ISO format (YYYY-MM-DD), US format (MM/DD/YYYY), UK format (DD/MM/YYYY), and named formats like 'Apr 15, 2024'. For best results, use YYYY-MM-DD as it is unambiguous and universally compatible.",
        "category": "data_uploads",
        "sort_order": 4,
        "is_published": True,
    },
    {
        "title": "How often should I upload new data?",
        "body": "Most clients upload weekly or monthly exports from their ad platforms. For the most current view, upload whenever you receive a fresh export from Google Ads or Meta Ads Manager. Future versions will support automated data connections to eliminate manual uploads.",
        "category": "data_uploads",
        "sort_order": 5,
        "is_published": True,
    },
    {
        "title": "What happens if my CSV has extra or unexpected columns?",
        "body": "Extra columns are imported alongside standard ones. The dashboard automatically maps known metric names and stores unrecognised columns too — they remain accessible when you ask SpokesBot about them by name.",
        "category": "data_uploads",
        "sort_order": 6,
        "is_published": True,
    },
    # ── Troubleshooting ───────────────────────────────────────────────────────
    {
        "title": "Why are some KPI cards showing dashes or zeros?",
        "body": "A dash or zero means the required column was not found in your dataset, or it exists but has no data for the selected date range. Check that your CSV includes the relevant metric column (e.g. Revenue, Cost, Clicks) and that your date filter is not excluding all rows.",
        "category": "troubleshooting",
        "sort_order": 1,
        "is_published": True,
    },
    {
        "title": "Why does the Campaign Breakdown table appear empty?",
        "body": "The Campaign Breakdown table requires a campaign name column in your dataset. If the table is empty, your CSV may be missing a column with 'campaign' in its name. It can also appear empty if the selected date range returns no data — try switching to 'All Data' to verify.",
        "category": "troubleshooting",
        "sort_order": 2,
        "is_published": True,
    },
    {
        "title": "Why are the charts not rendering any data?",
        "body": "Charts need both a date column and at least one numeric metric column. If either is missing or the date column has an unrecognised format, charts will be blank. Try switching the date filter to 'All Data' and verify your CSV has a properly formatted date column.",
        "category": "troubleshooting",
        "sort_order": 3,
        "is_published": True,
    },
    {
        "title": "The dashboard is loading slowly — what should I do?",
        "body": "Slow load times are most common with very large datasets. Try refreshing the page. If you are on 'All Data' with a large file, switching to a shorter preset like Last 30 Days can significantly speed up chart rendering.",
        "category": "troubleshooting",
        "sort_order": 4,
        "is_published": True,
    },
    {
        "title": "SpokesBot is not responding — what should I do?",
        "body": "If SpokesBot stops responding mid-answer, it may have hit a timeout on a complex query. Close and reopen the chat widget, then try rephrasing your question more specifically. If the issue persists, refresh the page. Complex questions over very large datasets can occasionally time out.",
        "category": "troubleshooting",
        "sort_order": 5,
        "is_published": True,
    },
    {
        "title": "My ROAS looks incorrect — why might that be?",
        "body": "ROAS is calculated as Revenue ÷ Cost. If either column is mapped incorrectly (e.g. a conversion count column mistakenly mapped as Revenue), the result will be wrong. Check that your 'Revenue' or 'Conversion Value' column contains currency values, not counts.",
        "category": "troubleshooting",
        "sort_order": 6,
        "is_published": True,
    },
    {
        "title": "Why does my CTR show as a very small decimal?",
        "body": "Some ad platforms export CTR as a ratio (e.g. 0.0345) rather than a percentage (3.45%). The dashboard automatically detects this and displays CTR with a % symbol. If it still looks wrong, check how CTR is stored in your CSV file.",
        "category": "troubleshooting",
        "sort_order": 7,
        "is_published": True,
    },
    {
        "title": "I uploaded a new file but the dashboard still shows old data.",
        "body": "After uploading, make sure you select the newly uploaded dataset from the dataset selector at the top of the channel page. The dashboard does not automatically switch to the newest dataset — you need to select it to activate it.",
        "category": "troubleshooting",
        "sort_order": 8,
        "is_published": True,
    },
    {
        "title": "Why is the daily breakdown only showing a few days?",
        "body": "The Daily Performance table respects the active date filter. If 'This Month' is selected early in the month, only elapsed days appear. Switch to 'All Data' or a longer preset like 'Last 30 Days' to see more rows.",
        "category": "troubleshooting",
        "sort_order": 9,
        "is_published": True,
    },
    {
        "title": "Can I export the data I see in the dashboard?",
        "body": "The dashboard does not currently have a built-in CSV export for chart data. You can ask SpokesBot to summarise any metric for any period and copy the answer. For full raw data exports, use your original ad platform (Google Ads or Meta Ads Manager).",
        "category": "troubleshooting",
        "sort_order": 10,
        "is_published": True,
    },
    # ── Zocket-style: Getting Started ─────────────────────────────────────────
    {
        "title": "How do I get my first insight in under 60 seconds?",
        "body": "Upload your CSV, select your channel (Google or Meta), and hit the AI chat button. Ask 'What is my best performing campaign?' and SpokesBot will pull the answer straight from your data. No setup, no configuration — just upload and ask.",
        "category": "getting_started",
        "sort_order": 10,
        "is_published": True,
    },
    {
        "title": "What is the fastest way to understand my ad performance?",
        "body": "Look at your KPI cards first — they give you Spend, Revenue, ROAS, and CTR at a glance. If a number looks off, tap the AI chat and ask 'Why is my ROAS low?' SpokesBot will dig into the data and explain it in plain English.",
        "category": "getting_started",
        "sort_order": 11,
        "is_published": True,
    },
    {
        "title": "Do I need to configure anything before I start?",
        "body": "Nothing. Upload your CSV and the dashboard auto-detects your columns, maps your metrics, and builds your charts automatically. No manual column mapping, no settings to tweak. You are live the moment your file is processed.",
        "category": "getting_started",
        "sort_order": 12,
        "is_published": True,
    },
    {
        "title": "Can I use the dashboard on my phone?",
        "body": "Yes. The dashboard is fully responsive. Tap the menu icon at the top-left to open navigation on mobile. Charts are touch-scrollable and the AI chat works exactly the same on phone as on desktop.",
        "category": "getting_started",
        "sort_order": 13,
        "is_published": True,
    },
    {
        "title": "What should I do first after logging in?",
        "body": "Go to the channel that matters most — Google Ads or Meta Ads — and pick your date range. Start with Last 30 Days to get a full picture. Then open the AI chat and ask for your top insight. You will know exactly where to focus in under two minutes.",
        "category": "getting_started",
        "sort_order": 14,
        "is_published": True,
    },
    # ── Zocket-style: Dashboards ──────────────────────────────────────────────
    {
        "title": "How do I instantly spot my best and worst campaigns?",
        "body": "Go to the Campaign Breakdown table and click the ROAS column header to sort highest to lowest. Your top performers float to the top. Click Cost to see where you are spending the most. Cross-referencing the two tells you exactly where to double down and where to cut.",
        "category": "dashboards",
        "sort_order": 20,
        "is_published": True,
    },
    {
        "title": "My ROAS dropped this week — how do I find out why?",
        "body": "Open the AI chat and type 'Why did my ROAS drop this week?' SpokesBot will compare this week vs last week, identify which campaigns or days drove the dip, and give you a specific cause — not a generic answer.",
        "category": "dashboards",
        "sort_order": 21,
        "is_published": True,
    },
    {
        "title": "How do I know if my ad spend is actually working?",
        "body": "Check the Revenue vs Cost trend chart. If the revenue area stays above the cost area, your spend is generating positive returns. If the gap is narrowing, efficiency is declining. A quick ROAS check confirms it — anything above 1.0x means you are making more than you spend.",
        "category": "dashboards",
        "sort_order": 22,
        "is_published": True,
    },
    {
        "title": "What is a good ROAS benchmark for my industry?",
        "body": "For e-commerce, 3–5x ROAS is a solid target. For dispensaries, benchmarks vary by market and product margin — your account manager can share category-specific targets. The dashboard always shows your actual ROAS so you can measure against whatever benchmark applies to you.",
        "category": "dashboards",
        "sort_order": 23,
        "is_published": True,
    },
    {
        "title": "How do I find my highest-revenue day?",
        "body": "Go to the Daily Performance table, click the Revenue column header, and it sorts highest to lowest. Your best day jumps to the top. You can do the same for any metric — Clicks, ROAS, Conversions — to instantly find your peak days.",
        "category": "dashboards",
        "sort_order": 24,
        "is_published": True,
    },
    {
        "title": "Can I see how my campaigns compare side by side?",
        "body": "Yes. The Campaign Breakdown table shows all campaigns in one view with every metric side by side. Sort by any column to rank them. You can also ask SpokesBot 'Compare campaign A vs campaign B on ROAS' and it will generate a comparison table with a chart.",
        "category": "dashboards",
        "sort_order": 25,
        "is_published": True,
    },
    {
        "title": "What does a healthy CTR look like for Meta Ads?",
        "body": "For Meta Ads, a CTR of 1–3% is considered healthy for most industries. Anything above 3% means your creative is resonating strongly. Below 0.5% is a signal to refresh your ad creative or tighten your audience targeting.",
        "category": "dashboards",
        "sort_order": 26,
        "is_published": True,
    },
    {
        "title": "What does a healthy CTR look like for Google Ads?",
        "body": "Google Search Ads typically see 3–10% CTR depending on keyword competitiveness and ad copy quality. Display and Performance Max campaigns sit much lower, around 0.3–0.5%. Always compare CTR within the same campaign type rather than across types.",
        "category": "dashboards",
        "sort_order": 27,
        "is_published": True,
    },
    {
        "title": "How do I track if my cost per conversion is improving?",
        "body": "Check the Transactions vs CPA chart — it shows conversion volume as bars and Cost Per Acquisition as a line. You want bars going up and the line going down. If both are rising, you are scaling at higher cost. If the line is falling, efficiency is improving.",
        "category": "dashboards",
        "sort_order": 28,
        "is_published": True,
    },
    # ── Zocket-style: AI Assistant ────────────────────────────────────────────
    {
        "title": "What is the single best question to ask SpokesBot first?",
        "body": "Start with: 'Give me the most important insight from my data right now.' SpokesBot will scan your dataset and surface the single strongest signal — whether it is a top campaign, a metric anomaly, or an efficiency gap. One question, one actionable answer.",
        "category": "ai_assistant",
        "sort_order": 20,
        "is_published": True,
    },
    {
        "title": "Can SpokesBot tell me where I am wasting money?",
        "body": "Ask it: 'Which campaigns have the lowest ROAS?' or 'Which ad sets are spending the most with the fewest conversions?' SpokesBot will rank your campaigns by efficiency and pinpoint the ones draining budget without delivering returns.",
        "category": "ai_assistant",
        "sort_order": 21,
        "is_published": True,
    },
    {
        "title": "Can I ask SpokesBot to forecast next month's revenue?",
        "body": "Yes. Type 'Forecast next month's revenue based on current trends.' SpokesBot pulls your daily average revenue from your dataset, extrapolates it forward 30 days, and gives you a projected figure — clearly labelled as an estimate so you know it is trend-based, not a guarantee.",
        "category": "ai_assistant",
        "sort_order": 22,
        "is_published": True,
    },
    {
        "title": "Can SpokesBot recommend which campaign to scale?",
        "body": "Ask: 'Which campaign should I scale based on current ROAS and conversion volume?' SpokesBot will look at both efficiency (ROAS) and volume (conversions) together and identify the campaign with the strongest combination — the one most worth increasing budget on.",
        "category": "ai_assistant",
        "sort_order": 23,
        "is_published": True,
    },
    {
        "title": "Can SpokesBot tell me my best day of the week for conversions?",
        "body": "Yes. Ask: 'Which day of the week gets the most conversions?' SpokesBot will aggregate your daily data by weekday and rank them. Knowing your highest-converting days lets you schedule ad boosts and budget shifts at exactly the right time.",
        "category": "ai_assistant",
        "sort_order": 24,
        "is_published": True,
    },
    {
        "title": "How do I get a week-over-week performance summary?",
        "body": "Ask: 'Give me a week-over-week summary of my key metrics.' SpokesBot will compare this week vs last week across spend, revenue, ROAS, clicks, and CTR — and flag any significant changes worth attention.",
        "category": "ai_assistant",
        "sort_order": 25,
        "is_published": True,
    },
    {
        "title": "How do I get SpokesBot to explain a metric I do not understand?",
        "body": "Just ask in plain language: 'What does CPA mean?' or 'Explain what ROAS is and what mine means for my business.' SpokesBot will give you a definition and immediately tie it to your actual numbers so the answer is always relevant to your data.",
        "category": "ai_assistant",
        "sort_order": 26,
        "is_published": True,
    },
    # ── Zocket-style: Data Uploads ────────────────────────────────────────────
    {
        "title": "How do I download my data from Meta Ads Manager?",
        "body": "In Meta Ads Manager, go to Reports → Export → choose your columns and date range → export as CSV. Include Date, Campaign Name, Impressions, Clicks, Amount Spent, and Purchase Conversion Value. That file uploads directly into the dashboard without any editing needed.",
        "category": "data_uploads",
        "sort_order": 10,
        "is_published": True,
    },
    {
        "title": "How do I download my data from Google Ads?",
        "body": "In Google Ads, go to Reports → Predefined Reports → choose the report type (e.g. Campaign) → set your date range → download as CSV. Include Date, Campaign, Impressions, Clicks, Cost, Conversions, and Conversion Value for the best dashboard experience.",
        "category": "data_uploads",
        "sort_order": 11,
        "is_published": True,
    },
    {
        "title": "My upload failed — what should I check?",
        "body": "Check three things: (1) the file is a .csv, not .xlsx — convert it if needed; (2) the first row is a header row with column names; (3) the file is not empty. If it still fails, open the file in a text editor and check for unusual characters or encoding issues.",
        "category": "data_uploads",
        "sort_order": 12,
        "is_published": True,
    },
    {
        "title": "Can I upload data from a tool other than Google or Meta?",
        "body": "Yes. Any CSV from any ad platform works as long as it has recognisable column names. TikTok Ads, Snapchat, Amazon Ads, Shopify reports, and custom exports all work. SpokesBot maps whatever metrics it can detect and ignores columns it cannot use.",
        "category": "data_uploads",
        "sort_order": 13,
        "is_published": True,
    },
    # ── Zocket-style: Troubleshooting ─────────────────────────────────────────
    {
        "title": "My numbers look different from what I see in Google Ads — why?",
        "body": "Differences usually come down to date ranges or attribution windows. Make sure the date range in your dashboard matches your Google Ads export period exactly. Also check if your CSV uses Last Click attribution while Google Ads UI shows Data-driven — these produce different conversion numbers.",
        "category": "troubleshooting",
        "sort_order": 20,
        "is_published": True,
    },
    {
        "title": "My numbers look different from what I see in Meta Ads Manager — why?",
        "body": "Meta often reports conversions using a 7-day click / 1-day view attribution window by default, but your CSV export might use a different window. Check the attribution setting used when you exported the CSV and match it to your Meta Ads Manager view settings.",
        "category": "troubleshooting",
        "sort_order": 21,
        "is_published": True,
    },
    {
        "title": "The AI chat is giving me a loading spinner and no answer — what do I do?",
        "body": "Wait up to 30 seconds — complex queries over large datasets take a moment. If there is still no answer, close and reopen the chat widget and try a simpler version of your question. Very broad questions like 'Tell me everything about my data' tend to time out — be specific.",
        "category": "troubleshooting",
        "sort_order": 22,
        "is_published": True,
    },
    {
        "title": "I can see data in the charts but the KPI cards are all dashes — why?",
        "body": "KPI cards need specific column names to map to. If they show dashes while charts work, your column names may be non-standard (e.g. 'Ad Spend' instead of 'Cost'). Ask SpokesBot 'What columns are in my dataset?' and it will list exactly what it found.",
        "category": "troubleshooting",
        "sort_order": 23,
        "is_published": True,
    },
    {
        "title": "Can I fix a wrong column mapping without re-uploading?",
        "body": "Currently, re-uploading the corrected CSV is the fastest fix. Before re-uploading, rename the column headers in your file to clearer names — e.g. rename 'Amount Spent' to 'Cost' and 'Purchase Conversion Value' to 'Revenue'. The dashboard will re-map automatically on the new upload.",
        "category": "troubleshooting",
        "sort_order": 24,
        "is_published": True,
    },
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed help articles via backend API.")
    parser.add_argument("--api-url", required=True, help="Backend base URL (no trailing slash)")
    parser.add_argument("--token", required=True, help="Admin Supabase access token")
    parser.add_argument("--dry-run", action="store_true", help="Print articles without posting")
    args = parser.parse_args()

    if args.dry_run:
        print(f"DRY RUN — would post {len(ARTICLES)} articles to {args.api_url}")
        for a in ARTICLES:
            print(f"  [{a['category']}] {a['title']}")
        return

    headers = {"Authorization": f"Bearer {args.token}", "Content-Type": "application/json"}
    created = 0
    failed = 0

    with httpx.Client(base_url=args.api_url, timeout=30) as client:
        for article in ARTICLES:
            resp = client.post("/help/articles", headers=headers, json=article)
            if resp.status_code == 201:
                created += 1
                print(f"  ✓ [{article['category']}] {article['title']}")
            else:
                failed += 1
                print(f"  ✗ [{article['category']}] {article['title']} — {resp.status_code}: {resp.text[:120]}")

    print(f"\nDone. {created} created, {failed} failed.")


if __name__ == "__main__":
    main()
