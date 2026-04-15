"""
Prometheus metrics definitions.

Centralised here so every module that wants to record a metric imports from
this file instead of creating duplicate collectors (which would raise a
ValueError on the second registration).
"""

from prometheus_client import Counter, Histogram

# ── HTTP request metrics ──────────────────────────────────────────────────────
http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests handled",
    ["method", "endpoint", "status_code"],
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)

# ── AI agent metrics ──────────────────────────────────────────────────────────
agent_chat_requests_total = Counter(
    "agent_chat_requests_total",
    "Total chat requests sent to the LangGraph agent",
    ["status"],  # success | error
)

agent_stream_tokens_total = Counter(
    "agent_stream_tokens_total",
    "Total tokens streamed from the LangGraph agent",
)

# ── Dataset metrics ───────────────────────────────────────────────────────────
dataset_uploads_total = Counter(
    "dataset_uploads_total",
    "Total dataset upload attempts",
    ["status"],  # queued | failed
)

dataset_ingestion_duration_seconds = Histogram(
    "dataset_ingestion_duration_seconds",
    "Time taken to ingest a dataset CSV → Parquet",
    buckets=[1, 5, 10, 30, 60, 120, 300],
)
