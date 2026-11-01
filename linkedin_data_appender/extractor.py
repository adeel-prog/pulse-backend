from __future__ import annotations

import json
import re
from datetime import date
from html.parser import HTMLParser
from typing import Iterable

from .models import (
    CandidateProfile,
    Experience,
    company_tenure_months,
    merge_experience_months,
    normalize_company,
)


MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

MONTH_ALT = (
    r"Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?"
)


class LinkedInHTMLExtractor(HTMLParser):
    """Extract profile facts from LinkedIn public profile HTML or saved pages."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._title = ""
        self._meta: dict[str, str] = {}
        self._scripts: list[str] = []
        self._current_tag: str | None = None
        self._current_attrs: dict[str, str] = {}
        self._buffer: list[str] = []
        self._text_fragments: list[str] = []
        self._in_script = False
        self._capture_script = False
        self._script_buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key.lower(): value or "" for key, value in attrs}
        self._current_tag = tag
        self._current_attrs = attributes

        if tag == "meta":
            key = attributes.get("property") or attributes.get("name")
            content = attributes.get("content")
            if key and content:
                self._meta[key.lower()] = content.strip()
        elif tag == "script":
            script_type = attributes.get("type", "").lower()
            self._in_script = True
            # Only structured data is useful. Untyped script bodies are page
            # JavaScript and must not be treated as profile text.
            self._capture_script = "json" in script_type
            self._script_buffer = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._title = normalize_text(" ".join(self._buffer))
        elif tag == "script" and self._in_script:
            if self._capture_script:
                script = "".join(self._script_buffer).strip()
                if script:
                    self._scripts.append(script)
            self._in_script = False
            self._capture_script = False
            self._script_buffer = []

        self._buffer = []
        self._current_tag = None
        self._current_attrs = {}

    def handle_data(self, data: str) -> None:
        if self._in_script:
            if self._capture_script:
                self._script_buffer.append(data)
            return
        if self._current_tag == "title":
            self._buffer.append(data)
            return
        text = normalize_text(data)
        if text:
            self._text_fragments.append(text)

    def extract(self, url: str, fetched_at: date | None = None) -> CandidateProfile:
        fetched_at = fetched_at or date.today()
        linked_data = list(self._json_ld_objects())
        profile = CandidateProfile(linkedin_url=url, source="html")

        profile.full_name = first_non_empty(
            self._person_value(linked_data, "name"),
            clean_title_name(self._meta_value("og:title")),
            first_non_empty(
                f"{self._meta_value('profile:first_name')} {self._meta_value('profile:last_name')}"
            ),
            clean_title_name(self._title),
        )
        profile.current_job_title = first_non_empty(
            self._person_value(linked_data, "jobTitle"),
            self._occupation_title(linked_data),
            headline_title(self._meta_value("og:title")),
            headline_title(self._meta_value("og:description")),
            headline_title(self._meta_value("description")),
            headline_title(self._title),
        )
        profile.company_name = first_non_empty(
            self._organization_name(linked_data),
            self._occupation_company(linked_data),
            headline_company(self._meta_value("og:title")),
            headline_company(self._meta_value("og:description")),
            headline_company(self._meta_value("description")),
            headline_company(self._title),
        )

        experiences = list(experience_candidates(self._combined_text(), fetched_at))
        if experiences:
            current = next((item for item in experiences if item.is_current), None)
            fallback = current or experiences[0]
            # A dated current role is the job the candidate holds now. Headline
            # and JSON-LD text are only used when that role is missing.
            if current is not None:
                profile.current_job_title = current.title or profile.current_job_title
                profile.company_name = current.company or profile.company_name
            else:
                profile.current_job_title = profile.current_job_title or fallback.title
                profile.company_name = profile.company_name or fallback.company
            profile.present_experience_months = company_tenure_months(
                experiences,
                profile.company_name or fallback.company,
            )
            if profile.present_experience_months is None:
                profile.present_experience_months = fallback.duration_months
            profile.total_experience_months = merge_experience_months(experiences)

        profile.raw_headline = first_non_empty(
            self._meta_value("og:title"),
            self._meta_value("og:description"),
            self._meta_value("description"),
            self._title,
        )
        return profile

    def _meta_value(self, key: str) -> str:
        return self._meta.get(key.lower(), "")

    def _combined_text(self) -> str:
        values = [self._title, *self._meta.values(), *self._text_fragments, *self._scripts]
        return "\n".join(value for value in values if value)

    def _json_ld_objects(self) -> Iterable[dict[str, object]]:
        for script in self._scripts:
            try:
                payload = json.loads(script)
            except json.JSONDecodeError:
                continue
            yield from iter_json_ld_objects(payload)

    @staticmethod
    def _person_value(objects: Iterable[dict[str, object]], key: str) -> str:
        for item in objects:
            item_type = item.get("@type") or item.get("type")
            if _is_person_type(item_type) and isinstance(item.get(key), str):
                return str(item[key]).strip()
        return ""

    @staticmethod
    def _organization_name(objects: Iterable[dict[str, object]]) -> str:
        for item in objects:
            item_type = item.get("@type") or item.get("type")
            if not _is_person_type(item_type):
                continue
            name = organization_name(item.get("worksFor"))
            if name:
                return name
        return ""

    @staticmethod
    def _occupation_title(objects: Iterable[dict[str, object]]) -> str:
        for item in objects:
            occupation = item.get("hasOccupation")
            titles = occupation_values(occupation, "name")
            if titles:
                return titles[0]
        return ""

    @staticmethod
    def _occupation_company(objects: Iterable[dict[str, object]]) -> str:
        for item in objects:
            occupation = item.get("hasOccupation")
            for value in occupation_values(occupation, "occupationLocation"):
                if value:
                    return value
            companies = occupation_organizations(occupation)
            if companies:
                return companies[0]
        return ""


def parse_profile_html(html: str, url: str, fetched_at: date | None = None) -> CandidateProfile:
    parser = LinkedInHTMLExtractor()
    parser.feed(html)
    return parser.extract(url=url, fetched_at=fetched_at)


def iter_json_ld_objects(payload: object) -> Iterable[dict[str, object]]:
    if isinstance(payload, list):
        for item in payload:
            yield from iter_json_ld_objects(item)
        return
    if not isinstance(payload, dict):
        return
    yield payload
    graph = payload.get("@graph")
    if isinstance(graph, list):
        for item in graph:
            if isinstance(item, dict):
                yield item


def _is_person_type(item_type: object) -> bool:
    if item_type == "Person":
        return True
    if isinstance(item_type, list):
        return "Person" in item_type
    return False


def organization_name(works_for: object) -> str:
    if isinstance(works_for, str):
        return works_for.strip()
    if isinstance(works_for, dict):
        name = works_for.get("name")
        if isinstance(name, str) and name.strip():
            return name.strip()
        return ""
    if isinstance(works_for, list):
        for item in works_for:
            name = organization_name(item)
            if name:
                return name
    return ""


def occupation_values(occupation: object, key: str) -> list[str]:
    values: list[str] = []
    for item in _as_dict_list(occupation):
        raw = item.get(key)
        if isinstance(raw, str) and raw.strip():
            values.append(raw.strip())
        elif isinstance(raw, dict):
            name = raw.get("name")
            if isinstance(name, str) and name.strip():
                values.append(name.strip())
    return values


def occupation_organizations(occupation: object) -> list[str]:
    values: list[str] = []
    for item in _as_dict_list(occupation):
        name = organization_name(item.get("worksFor") or item.get("hiringOrganization"))
        if name:
            values.append(name)
    return values


def _as_dict_list(value: object) -> list[dict[str, object]]:
    if isinstance(value, dict):
        return [value]
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    return []


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def first_non_empty(*values: str | None) -> str:
    for value in values:
        normalized = normalize_text(value or "")
        if normalized:
            return normalized
    return ""


def clean_title_name(value: str) -> str:
    value = normalize_text(value)
    if not value:
        return ""
    value = re.sub(r"\s*\|\s*LinkedIn\s*$", "", value, flags=re.I)
    value = re.sub(r"\s*-\s*LinkedIn\s*$", "", value, flags=re.I)
    return value.split(" - ")[0].strip()


def headline_title(value: str) -> str:
    headline = headline_fragment(value)
    if not headline:
        return ""
    for separator in (" at ", " @ "):
        if separator in headline:
            return headline.split(separator, 1)[0].strip()
    return ""


def headline_company(value: str) -> str:
    headline = headline_fragment(value)
    if not headline:
        return ""
    for separator in (" at ", " @ "):
        if separator in headline:
            return headline.split(separator, 1)[1].split("|", 1)[0].strip()
    return ""


def headline_fragment(value: str) -> str:
    value = normalize_text(value)
    if not value:
        return ""
    value = re.sub(r"\s*\|\s*LinkedIn\s*$", "", value, flags=re.I)
    parts = [part.strip() for part in value.split(" - ") if part.strip()]
    return parts[1] if len(parts) > 1 else ""


# Require whitespace between company and the start date so company names are
# not truncated (for example "Example Labs" -> "Ex").
DATE_RANGE_CORE = (
    rf"(?:(?P<start_month>{MONTH_ALT})\.?)?"
    r"\s*(?P<start_year>19\d{2}|20\d{2})\s*(?:to|[-–—])\s*"
    rf"(?:(?:(?P<end_month>{MONTH_ALT})\.?)?"
    r"\s*(?P<end_year>19\d{2}|20\d{2})|(?P<present>Present|Current))"
)

DATE_RANGE_PATTERN = re.compile(
    rf"(?P<title>[A-Z][A-Za-z0-9 /&,+.#'-]{{2,80}}?)\s+at\s+"
    rf"(?P<company>[A-Z][A-Za-z0-9 /&,+.#'-]{{1,80}}?)\s+"
    + DATE_RANGE_CORE,
    re.I,
)

LINE_DATE_RANGE_PATTERN = re.compile(
    rf"^{DATE_RANGE_CORE}(?:\s*[·•].*)?$",
    re.I,
)

EMPLOYMENT_TYPES = {
    "full-time",
    "full time",
    "part-time",
    "part time",
    "contract",
    "internship",
    "freelance",
    "self-employed",
    "self employed",
    "seasonal",
    "apprenticeship",
    "permanent",
}


def experience_candidates(text: str, today: date) -> Iterable[Experience]:
    seen: set[tuple[str, str, date, date]] = set()
    for experience in (
        *experiences_from_inline_text(text, today),
        *experiences_from_line_blocks(text, today),
    ):
        key = (
            experience.title.lower(),
            experience.company.lower(),
            experience.start,
            experience.end,
        )
        if key in seen:
            continue
        seen.add(key)
        yield experience


def experiences_from_inline_text(text: str, today: date) -> Iterable[Experience]:
    for match in DATE_RANGE_PATTERN.finditer(text):
        experience = experience_from_match(match, today)
        if experience is not None:
            yield experience


def experiences_from_line_blocks(text: str, today: date) -> Iterable[Experience]:
    """Parse stacked LinkedIn experience blocks: title, company, date range."""
    lines = [normalize_text(line) for line in text.splitlines() if normalize_text(line)]
    for index, line in enumerate(lines):
        match = LINE_DATE_RANGE_PATTERN.match(line)
        if not match:
            continue

        role = role_and_company_before(lines, index)
        if role is None:
            continue
        title, company = role
        if not looks_like_role(title) or not looks_like_company(company):
            continue

        start, end, is_current = dates_from_match(match, today)
        yield Experience(
            title=title,
            company=company,
            start=start,
            end=end,
            is_current=is_current,
        )


def role_and_company_before(lines: list[str], date_index: int) -> tuple[str, str] | None:
    """Walk backward from a date line to the company and title.

    Saved LinkedIn HTML repeats accessible names, and it inserts employment
    type and location lines between the company and the dates.
    """
    picked: list[str] = []
    cursor = date_index - 1
    while cursor >= 0 and len(picked) < 2:
        line = lines[cursor]
        cursor -= 1
        if LINE_DATE_RANGE_PATTERN.match(line):
            # Saved pages repeat the same date line for screen readers.
            # A different date belongs to another role, so stop there.
            if line.lower() == lines[date_index].lower():
                continue
            break
        cleaned = strip_bullet_suffix(line)
        if not cleaned:
            continue
        if is_employment_type(cleaned) or looks_like_location(cleaned):
            continue
        if picked and normalize_company(picked[-1]) == normalize_company(cleaned):
            continue
        picked.append(cleaned)

    if len(picked) < 2:
        return None
    company = picked[0]
    title = clean_experience_title(picked[1])
    return title, company


def strip_bullet_suffix(value: str) -> str:
    return re.sub(r"\s*[·•].*$", "", normalize_text(value)).strip()


def is_employment_type(value: str) -> bool:
    return value.lower().strip(" .") in EMPLOYMENT_TYPES


def looks_like_location(value: str) -> bool:
    lowered = value.lower().strip()
    if lowered in {"remote", "hybrid", "on-site", "onsite", "on site"}:
        return True
    if re.search(r"\b(inc|llc|ltd|corp|gmbh|labs|studio)\b", lowered):
        return False
    if re.search(r",\s*[A-Z]{2}\b", value):
        return True
    if "," in value and re.search(r",\s*[A-Z][a-z]+", value):
        return True
    if re.search(r"\b(bay area|metropolitan area)\b", lowered):
        return True
    return lowered.startswith("greater ") and "," in value


def experience_from_match(match: re.Match[str], today: date) -> Experience | None:
    title = clean_experience_title(match.group("title"))
    company = normalize_text(match.group("company"))
    if not title or not company:
        return None
    start, end, is_current = dates_from_match(match, today)
    return Experience(
        title=title,
        company=company,
        start=start,
        end=end,
        is_current=is_current,
    )


def dates_from_match(match: re.Match[str], today: date) -> tuple[date, date, bool]:
    start_month = month_number(match.group("start_month")) or 1
    start = date(int(match.group("start_year")), start_month, 1)
    if match.group("present"):
        return start, today, True
    end_month = month_number(match.group("end_month")) or 12
    end = date(int(match.group("end_year")), end_month, 1)
    return start, end, False


def clean_experience_title(value: str) -> str:
    title = normalize_text(value)
    if " - " in title:
        # Prefer the right-hand fragment when a person name leaked into the match.
        title = title.split(" - ")[-1].strip()
    title = re.sub(r"\s*[·•].*$", "", title).strip()
    return title


def looks_like_role(value: str) -> bool:
    if not value or len(value) > 80:
        return False
    lowered = value.lower()
    if lowered.startswith(("http://", "https://")):
        return False
    if LINE_DATE_RANGE_PATTERN.match(value):
        return False
    return bool(re.search(r"[A-Za-z]", value))


def looks_like_company(value: str) -> bool:
    if not value or len(value) > 80:
        return False
    lowered = value.lower()
    if lowered in {"present", "current", "linkedin"}:
        return False
    if LINE_DATE_RANGE_PATTERN.match(value):
        return False
    return bool(re.search(r"[A-Za-z]", value))


def month_number(value: str | None) -> int | None:
    if not value:
        return None
    return MONTHS.get(value.lower().rstrip("."))
