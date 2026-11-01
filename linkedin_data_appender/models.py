from __future__ import annotations

from dataclasses import dataclass, fields
from datetime import date
from typing import Any


@dataclass(slots=True)
class Experience:
    title: str
    company: str
    start: date
    end: date
    is_current: bool = False

    @property
    def duration_months(self) -> int:
        return month_delta(self.start, self.end)


@dataclass(slots=True)
class CandidateProfile:
    linkedin_url: str
    full_name: str = ""
    current_job_title: str = ""
    total_experience_months: int | None = None
    present_experience_months: int | None = None
    company_name: str = ""
    raw_headline: str = ""
    source: str = ""
    error: str = ""

    @classmethod
    def fieldnames(cls) -> list[str]:
        return [field.name for field in fields(cls)]

    def as_dict(self) -> dict[str, Any]:
        values = {field.name: getattr(self, field.name) for field in fields(self)}
        values["total_experience"] = format_months(self.total_experience_months)
        values["present_experience_in_current_company"] = format_months(
            self.present_experience_months
        )
        return values

    @classmethod
    def output_fieldnames(cls) -> list[str]:
        names = cls.fieldnames()
        insert_at = names.index("total_experience_months") + 1
        names.insert(insert_at, "total_experience")
        present_insert_at = names.index("present_experience_months") + 1
        names.insert(
            present_insert_at,
            "present_experience_in_current_company",
        )
        return names


def month_delta(start: date, end: date) -> int:
    months = (end.year - start.year) * 12 + end.month - start.month
    return max(months, 0)


def merge_experience_months(experiences: list[Experience]) -> int:
    """Sum experience while collapsing overlapping date ranges."""
    if not experiences:
        return 0

    ranges = sorted((item.start, item.end) for item in experiences)
    merged: list[tuple[date, date]] = [ranges[0]]
    for start, end in ranges[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return sum(month_delta(start, end) for start, end in merged)


def company_tenure_months(experiences: list[Experience], company: str) -> int | None:
    """Return tenure across all roles at the given company name."""
    normalized = normalize_company(company)
    if not normalized:
        return None

    matches = [
        item
        for item in experiences
        if normalize_company(item.company) == normalized
    ]
    if not matches:
        return None

    earliest = min(item.start for item in matches)
    latest = max(item.end for item in matches)
    return month_delta(earliest, latest)


def normalize_company(value: str) -> str:
    return " ".join(value.lower().split())


def format_months(months: int | None) -> str:
    if months is None:
        return ""
    years, remaining_months = divmod(months, 12)
    parts: list[str] = []
    if years:
        parts.append(f"{years} year{'s' if years != 1 else ''}")
    if remaining_months:
        parts.append(
            f"{remaining_months} month{'s' if remaining_months != 1 else ''}"
        )
    return " ".join(parts) if parts else "0 months"
