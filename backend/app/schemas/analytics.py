from datetime import date
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class DatePreset(StrEnum):
    today = "today"
    yesterday = "yesterday"
    last_7_days = "last_7_days"
    last_30_days = "last_30_days"
    last_90_days = "last_90_days"
    last_180_days = "last_180_days"
    this_month = "this_month"
    ytd = "ytd"
    custom = "custom"


class AnalyticsRequest(BaseModel):
    dataset_id: UUID
    operation: str  # describe | value_counts | groupby | correlation | auto

    # Existing operation params (unchanged)
    column: str | None = None
    group_by: str | None = None

    # Date filter — all optional; omitting means full dataset
    date_preset: DatePreset | None = None
    date_column: str | None = None  # column to filter on; required when date_preset is set
    start_date: date | None = None  # required only when date_preset = 'custom'
    end_date: date | None = None  # required only when date_preset = 'custom'

    @model_validator(mode="after")
    def validate_date_filter(self) -> "AnalyticsRequest":
        if self.date_preset is not None:
            if not self.date_column:
                raise ValueError("date_column is required when date_preset is set.")
            if self.date_preset == DatePreset.custom:
                if self.start_date is None or self.end_date is None:
                    raise ValueError(
                        "start_date and end_date are required when date_preset is 'custom'."
                    )
                if self.start_date > self.end_date:
                    raise ValueError("start_date must not be after end_date.")
        return self


class InsightsRequest(BaseModel):
    dataset_id: UUID
    date_preset: DatePreset | None = None
    date_column: str | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_date_filter(self) -> "InsightsRequest":
        if self.date_preset is not None:
            if not self.date_column:
                raise ValueError("date_column is required when date_preset is set.")
            if self.date_preset == DatePreset.custom:
                if self.start_date is None or self.end_date is None:
                    raise ValueError(
                        "start_date and end_date are required when date_preset is 'custom'."
                    )
                if self.start_date > self.end_date:
                    raise ValueError("start_date must not be after end_date.")
        return self


class AnalyticsResponse(BaseModel):
    dataset_id: UUID
    operation: str
    result: dict[str, Any]


class InsightItem(BaseModel):
    type: Literal["success", "trend", "warning", "alert"]
    text: str = Field(max_length=160)


class InsightsResponse(BaseModel):
    dataset_id: UUID
    insights: list[InsightItem]
