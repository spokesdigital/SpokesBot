"""
In-memory response cache for analytics endpoints.

Design:
  - threading.Lock for cross-thread safety (async handlers + sync background tasks both touch this).
  - Three data structures:
      _STORE        → TTL-checked values keyed by cache-key hash
      _ORG_INDEX    → O(1) org-scoped bulk eviction  (org_id → set of keys)
      _DATASET_INDEX→ O(1) per-dataset eviction       (dataset_id → set of keys)
  - No external dependencies — plain dicts + time.monotonic() for TTL.
  - Cache keys are SHA-256 hashes of all request parameters that affect the result.
"""

import hashlib
import json
import logging
import threading
import time
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)

_LOCK = threading.Lock()
_STORE: dict[str, tuple[Any, float]] = {}           # key → (value, expiry_monotonic)
_ORG_INDEX: dict[str, set[str]] = defaultdict(set)  # org_id → set of keys
_DATASET_INDEX: dict[str, set[str]] = defaultdict(set)  # dataset_id → set of keys

ANALYTICS_TTL = 3600  # 1 hour
INSIGHTS_TTL = 3600


def _make_key(**kwargs: Any) -> str:
    payload = json.dumps(kwargs, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def make_analytics_key(
    org_id: str,
    dataset_id: str,
    operation: str,
    date_preset: str | None,
    date_column: str | None,
    start_date: Any,
    end_date: Any,
    column: str | None,
    group_by: str | None,
) -> str:
    return _make_key(
        kind="analytics",
        org_id=org_id,
        dataset_id=str(dataset_id),
        operation=operation,
        date_preset=date_preset,
        date_column=date_column,
        start_date=str(start_date),
        end_date=str(end_date),
        column=column,
        group_by=group_by,
    )


def make_insights_key(
    org_id: str,
    dataset_id: str,
    date_preset: str | None,
    date_column: str | None,
    start_date: Any,
    end_date: Any,
) -> str:
    return _make_key(
        kind="insights",
        org_id=org_id,
        dataset_id=str(dataset_id),
        date_preset=date_preset,
        date_column=date_column,
        start_date=str(start_date),
        end_date=str(end_date),
    )


def cache_get(key: str) -> Any | None:
    """Return cached value or None if missing/expired."""
    with _LOCK:
        entry = _STORE.get(key)
        if entry is None:
            return None
        value, expiry = entry
        if time.monotonic() > expiry:
            del _STORE[key]
            return None
        return value


def cache_set(
    org_id: str,
    key: str,
    value: Any,
    ttl: int = ANALYTICS_TTL,
    dataset_id: str | None = None,
) -> None:
    """Store value under key, indexed by org_id (and optionally dataset_id) for eviction."""
    with _LOCK:
        _STORE[key] = (value, time.monotonic() + ttl)
        _ORG_INDEX[org_id].add(key)
        if dataset_id:
            _DATASET_INDEX[str(dataset_id)].add(key)


def invalidate_org(org_id: str) -> int:
    """Evict all cached entries for org_id. Returns the number of entries removed."""
    with _LOCK:
        keys = _ORG_INDEX.pop(org_id, set())
        count = sum(1 for k in keys if _STORE.pop(k, None) is not None)
        # Clean up any dataset-level index entries that pointed to these keys.
        for ds_keys in _DATASET_INDEX.values():
            ds_keys.difference_update(keys)
    if count:
        logger.info("cache_invalidate org_id=%s evicted=%d", org_id, count)
    return count


def invalidate_dataset(dataset_id: str) -> int:
    """Evict only the cached entries for a specific dataset.

    Use this instead of invalidate_org() when one dataset in an org is updated
    or deleted — other datasets' cached results remain intact.
    Returns the number of entries removed.
    """
    with _LOCK:
        keys = _DATASET_INDEX.pop(str(dataset_id), set())
        count = sum(1 for k in keys if _STORE.pop(k, None) is not None)
        # Clean up org-level index entries that pointed to these keys.
        for org_keys in _ORG_INDEX.values():
            org_keys.difference_update(keys)
    if count:
        logger.info("cache_invalidate_dataset dataset_id=%s evicted=%d", dataset_id, count)
    return count
