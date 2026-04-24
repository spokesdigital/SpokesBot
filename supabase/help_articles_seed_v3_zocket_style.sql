-- Help Articles — Zocket-style seed (v3)
-- Short, punchy, action-oriented answers. "You"-focused. Quick-win framing.
-- Run this in Supabase Dashboard → SQL Editor → New query

INSERT INTO help_articles (title, body, category, sort_order, is_published) VALUES

-- ─── Getting Started (Zocket style) ──────────────────────────────────────────

(
  'How do I get my first insight in under 60 seconds?',
  'Upload your CSV, select your channel (Google or Meta), and hit the AI chat button. Ask "What is my best performing campaign?" and SpokesBot will pull the answer straight from your data. No setup, no configuration — just upload and ask.',
  'getting_started', 10, true
),
(
  'What is the fastest way to understand my ad performance?',
  'Look at your KPI cards first — they give you Spend, Revenue, ROAS, and CTR at a glance. If a number looks off, tap the AI chat and ask "Why is my ROAS low?" SpokesBot will dig into the data and explain it in plain English.',
  'getting_started', 11, true
),
(
  'Do I need to configure anything before I start?',
  'Nothing. Upload your CSV and the dashboard auto-detects your columns, maps your metrics, and builds your charts automatically. No manual column mapping, no settings to tweak. You are live the moment your file is processed.',
  'getting_started', 12, true
),
(
  'Can I use the dashboard on my phone?',
  'Yes. The dashboard is fully responsive. Tap the menu icon at the top-left to open navigation on mobile. Charts are touch-scrollable, and the AI chat works exactly the same on phone as it does on desktop.',
  'getting_started', 13, true
),
(
  'What should I do first after logging in?',
  'Go to the channel that matters most to you — Google Ads or Meta Ads — and pick your date range. Start with Last 30 Days to get a full picture. Then open the AI chat and ask for your top insight. You will know exactly where to focus in under two minutes.',
  'getting_started', 14, true
),

-- ─── Dashboards (Zocket style) ────────────────────────────────────────────────

(
  'How do I instantly spot my best and worst campaigns?',
  'Go to the Campaign Breakdown table and click the ROAS column header to sort highest to lowest. Your top performers float to the top. Click Cost to see where you are spending the most. Cross-referencing the two tells you exactly where to double down and where to cut.',
  'dashboards', 20, true
),
(
  'My ROAS dropped this week — how do I find out why?',
  'Open the AI chat and type "Why did my ROAS drop this week?" SpokesBot will compare this week vs last week, identify which campaigns or days drove the dip, and give you a specific cause — not a generic answer.',
  'dashboards', 21, true
),
(
  'How do I know if my ad spend is actually working?',
  'Check the Revenue vs Cost trend chart. If the revenue area stays above the cost area, your spend is generating positive returns. If the gap is narrowing, your efficiency is declining. A quick ROAS check confirms it — anything above 1.0x means you are making more than you spend.',
  'dashboards', 22, true
),
(
  'What is a good ROAS benchmark for my industry?',
  'For e-commerce, 3–5x ROAS is a solid target. For dispensaries, benchmarks vary by market and product margin — your account manager can share category-specific targets. The dashboard will always show your actual ROAS so you can measure against whatever benchmark applies to you.',
  'dashboards', 23, true
),
(
  'How do I see my data without any date restrictions?',
  'Click the date filter and select "All Data" at the top of the dropdown. Every row in your dataset will load immediately — no date ceiling, no floor. Useful when you want to see a full campaign lifetime or find your all-time best day.',
  'dashboards', 24, true
),
(
  'Why do my charts scroll sideways?',
  'When you are viewing a lot of days (e.g. 90 days), the chart expands so each bar gets proper space instead of being squished. Just scroll left or right inside the chart to pan through the timeline. The zoom buttons let you narrow down to a specific window.',
  'dashboards', 25, true
),
(
  'How do I find my highest-revenue day?',
  'Go to the Daily Performance table, click the Revenue column header, and it sorts highest to lowest. Your best day jumps to the top. You can do the same for any metric — Clicks, ROAS, Conversions — to instantly find your peak days.',
  'dashboards', 26, true
),
(
  'Can I see how my campaigns compare side by side?',
  'Yes. The Campaign Breakdown table shows all campaigns in one view with every metric side by side. Sort by any column to rank them. You can also ask SpokesBot "Compare campaign A vs campaign B on ROAS" and it will generate a comparison table with a chart.',
  'dashboards', 27, true
),
(
  'What does a healthy CTR look like for Meta Ads?',
  'For Meta Ads, a CTR of 1–3% is considered healthy for most industries. Anything above 3% means your creative is resonating strongly. Below 0.5% is a signal to refresh your ad creative or tighten your audience targeting.',
  'dashboards', 28, true
),
(
  'What does a healthy CTR look like for Google Ads?',
  'Google Search Ads typically see 3–10% CTR depending on the keyword competitiveness and ad copy quality. Display and Performance Max campaigns sit much lower, around 0.3–0.5%. Always compare CTR within the same campaign type rather than across types.',
  'dashboards', 29, true
),
(
  'How do I track if my cost per conversion is improving?',
  'Check the Transactions vs CPA chart — it shows your conversion volume as bars and Cost Per Acquisition as a line. You want the bars going up and the line going down. If both are rising, you are scaling but at higher cost. If the line is falling, efficiency is improving.',
  'dashboards', 30, true
),

-- ─── AI Assistant (Zocket style) ──────────────────────────────────────────────

(
  'What is the single best question to ask SpokesBot first?',
  'Start with: "Give me the most important insight from my data right now." SpokesBot will scan your dataset and surface the single strongest signal — whether it is a top campaign, a metric anomaly, or an efficiency gap. One question, one actionable answer.',
  'ai_assistant', 20, true
),
(
  'Can SpokesBot tell me where I am wasting money?',
  'Ask it: "Which campaigns have the lowest ROAS?" or "Which ad sets are spending the most with the fewest conversions?" SpokesBot will rank your campaigns by efficiency and pinpoint the ones draining budget without delivering returns.',
  'ai_assistant', 21, true
),
(
  'Can I ask SpokesBot to forecast next month''s revenue?',
  'Yes. Type "Forecast next month''s revenue based on current trends." SpokesBot pulls your daily average revenue from your dataset, extrapolates it forward 30 days, and gives you a projected figure — clearly labelled as an estimate so you know it is a trend-based projection, not a guarantee.',
  'ai_assistant', 22, true
),
(
  'How do I get SpokesBot to explain a metric I do not understand?',
  'Just ask in plain language: "What does CPA mean?" or "Explain what ROAS is and what mine means for my business." SpokesBot will give you a definition and immediately tie it to your actual data so the answer is always relevant to your numbers.',
  'ai_assistant', 23, true
),
(
  'Can SpokesBot recommend which campaign to scale?',
  'Ask: "Which campaign should I scale based on current ROAS and conversion volume?" SpokesBot will look at both efficiency (ROAS) and volume (conversions) together and identify the campaign with the strongest combination — the one most worth increasing budget on.',
  'ai_assistant', 24, true
),
(
  'Can SpokesBot tell me my best day of the week for conversions?',
  'Yes. Ask: "Which day of the week gets the most conversions?" SpokesBot will aggregate your daily data by weekday and rank them. Knowing your highest-converting days lets you schedule ad boosts and budget shifts at exactly the right time.',
  'ai_assistant', 25, true
),
(
  'What happens if I ask SpokesBot something it cannot answer?',
  'SpokesBot will tell you clearly — for example, if the data needed to answer your question is not in your uploaded dataset. It never guesses or makes up numbers. If it cannot find the answer in your data, it will say so and suggest what information would be needed.',
  'ai_assistant', 26, true
),
(
  'Can I ask about ROI instead of ROAS?',
  'Absolutely. SpokesBot understands that ROI and ROAS mean the same thing in an ad context — both measure revenue earned per dollar spent. Use whichever term feels natural to you and SpokesBot will find the right column in your data.',
  'ai_assistant', 27, true
),
(
  'How do I get a week-over-week performance summary?',
  'Ask: "Give me a week-over-week summary of my key metrics." SpokesBot will compare this week vs last week across spend, revenue, ROAS, clicks, and CTR — and flag any significant changes worth attention.',
  'ai_assistant', 28, true
),

-- ─── Data Uploads (Zocket style) ──────────────────────────────────────────────

(
  'How do I download my data from Meta Ads Manager?',
  'In Meta Ads Manager, go to Reports → Export → choose your columns and date range → export as CSV. Make sure to include Date, Campaign Name, Impressions, Clicks, Amount Spent, and Purchase Conversion Value. That file uploads directly into the dashboard without any editing needed.',
  'data_uploads', 10, true
),
(
  'How do I download my data from Google Ads?',
  'In Google Ads, go to Reports → Predefined Reports → choose the report type (e.g. Campaign) → set your date range → download as CSV. Include Date, Campaign, Impressions, Clicks, Cost, Conversions, and Conversion Value for the best dashboard experience.',
  'data_uploads', 11, true
),
(
  'My upload failed — what should I check?',
  'Check three things: (1) the file is a .csv, not .xlsx or .xls — convert it first if needed; (2) the first row is a header row with column names; (3) the file is not empty. If it still fails, open the file in a text editor and check for unusual characters or encoding issues.',
  'data_uploads', 12, true
),
(
  'Can I upload data from a tool other than Google or Meta?',
  'Yes. Any CSV from any ad platform or analytics tool works as long as it has recognisable column names. TikTok Ads, Snapchat, Amazon Ads, Shopify reports, and custom exports all work. SpokesBot will map whatever metrics it can detect and ignore columns it cannot use.',
  'data_uploads', 13, true
),

-- ─── Troubleshooting (Zocket style) ───────────────────────────────────────────

(
  'My numbers look different from what I see in Google Ads — why?',
  'Differences usually come down to date ranges or attribution windows. Make sure the date range in your dashboard matches the export period from Google Ads exactly. Also check if your CSV uses "Last Click" attribution while Google Ads UI shows "Data-driven" — these produce different conversion numbers.',
  'troubleshooting', 20, true
),
(
  'My numbers look different from what I see in Meta Ads Manager — why?',
  'Meta often reports conversions using a 7-day click / 1-day view attribution window by default, but your CSV export might use a different window. Check the attribution setting used when you exported the CSV and match it to your Meta Ads Manager view settings.',
  'troubleshooting', 21, true
),
(
  'The AI chat is giving me a loading spinner and no answer — what do I do?',
  'Wait up to 30 seconds — complex queries over large datasets take a moment. If there is still no answer after 30 seconds, close and reopen the chat widget and try a simpler version of your question. Very broad questions like "Tell me everything about my data" tend to time out — be specific.',
  'troubleshooting', 22, true
),
(
  'I can see data in the charts but the KPI cards are all dashes — why?',
  'KPI cards need specific column names to map to. If they show dashes while charts work, your column names may be non-standard (e.g. "Ad Spend" instead of "Cost" or "Amount Spent"). Ask SpokesBot "What columns are in my dataset?" and it will list exactly what it found.',
  'troubleshooting', 23, true
),
(
  'Can I fix a wrong column mapping without re-uploading?',
  'Currently, re-uploading the corrected CSV is the fastest fix. Before re-uploading, rename the column headers in your file to clearer names (e.g. rename "Amount Spent" to "Cost" and "Purchase Conversion Value" to "Revenue"). The dashboard will re-map automatically on the new upload.',
  'troubleshooting', 24, true
)

;
