from __future__ import annotations

import csv
from collections.abc import Callable
from collections.abc import Iterable
from pathlib import Path

from .extractor import parse_profile_html
from .fetcher import ProfileFetcher
from .models import CandidateProfile


DEFAULT_URL_COLUMNS = (
    "linkedin_url",
    "linkedin",
    "linkedin_profile",
    "linkedin profile",
    "candidate_linkedin_url",
)


def append_linkedin_data(
    input_csv: str | Path,
    output_csv: str | Path,
    *,
    url_column: str | None = None,
    html_directory: str | Path | None = None,
    timeout_seconds: float = 20.0,
    user_agent: str | None = None,
    fetcher: Callable[[str], CandidateProfile] | ProfileFetcher | None = None,
) -> None:
    """Read candidate rows, append LinkedIn profile fields, and write a new CSV."""
    input_path = Path(input_csv)
    output_path = Path(output_csv)
    html_path = Path(html_directory) if html_directory else None

    with input_path.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        if not reader.fieldnames:
            raise ValueError(f"{input_path} does not contain a header row")

        selected_url_column = url_column or detect_url_column(reader.fieldnames)
        output_fields = merge_fieldnames(reader.fieldnames, prefixed_fieldnames())

        with output_path.open("w", newline="", encoding="utf-8") as destination:
            writer = csv.DictWriter(destination, fieldnames=output_fields, extrasaction="ignore")
            writer.writeheader()

            for row in reader:
                url = (row.get(selected_url_column) or "").strip()
                if fetcher is not None:
                    profile = profile_from_fetcher(url, fetcher)
                else:
                    profile = profile_for_url(
                        url,
                        html_directory=html_path,
                        timeout_seconds=timeout_seconds,
                        user_agent=user_agent,
                    )
                row.update(prefixed_profile_dict(profile))
                writer.writerow(row)


def profile_for_url(
    url: str,
    *,
    html_directory: Path | None = None,
    timeout_seconds: float = 20.0,
    user_agent: str | None = None,
) -> CandidateProfile:
    if not url:
        return CandidateProfile(linkedin_url="", error="missing LinkedIn URL")

    fetcher = ProfileFetcher(timeout=timeout_seconds, user_agent=user_agent)

    try:
        if html_directory:
            html = read_saved_html(url, html_directory)
            source = "html"
        else:
            result = fetcher.fetch(url)
            html = result.content
            source = result.source
    except (OSError, RuntimeError, ValueError) as exc:
        return CandidateProfile(linkedin_url=url, source="error", error=str(exc))

    try:
        profile = parse_profile_html(html, url=url)
        profile.source = source
        return profile
    except Exception as exc:  # Keep batch append jobs moving while surfacing bad rows.
        return CandidateProfile(linkedin_url=url, source="error", error=f"parse failed: {exc}")


def detect_url_column(fieldnames: Iterable[str]) -> str:
    normalized_to_original = {normalize_header(name): name for name in fieldnames}
    for candidate in DEFAULT_URL_COLUMNS:
        match = normalized_to_original.get(normalize_header(candidate))
        if match:
            return match
    raise ValueError(
        "Could not detect LinkedIn URL column. Pass --url-column with one of: "
        + ", ".join(fieldnames)
    )


def merge_fieldnames(original: Iterable[str], appended: Iterable[str]) -> list[str]:
    fields: list[str] = []
    seen: set[str] = set()
    for fieldname in [*original, *appended]:
        if fieldname not in seen:
            fields.append(fieldname)
            seen.add(fieldname)
    return fields


def prefixed_fieldnames() -> list[str]:
    return [f"linkedin_{fieldname}" for fieldname in CandidateProfile.output_fieldnames()]


def prefixed_profile_dict(profile: CandidateProfile) -> dict[str, object]:
    return {
        f"linkedin_{fieldname}": value
        for fieldname, value in profile.as_dict().items()
    }


def profile_from_fetcher(
    url: str,
    fetcher: Callable[[str], CandidateProfile] | ProfileFetcher,
) -> CandidateProfile:
    if isinstance(fetcher, ProfileFetcher):
        try:
            result = fetcher.fetch(url)
            profile = parse_profile_html(result.content, url=url)
            profile.source = result.source
            return profile
        except (OSError, RuntimeError, ValueError) as exc:
            return CandidateProfile(linkedin_url=url, source="error", error=str(exc))

    try:
        return fetcher(url)
    except Exception as exc:  # Keep batch append jobs moving while surfacing bad rows.
        return CandidateProfile(linkedin_url=url, source="error", error=str(exc))


def normalize_header(value: str) -> str:
    return value.strip().lower().replace(" ", "_").replace("-", "_")


def read_saved_html(url: str, html_directory: Path | None) -> str:
    if html_directory is None:
        raise ValueError("html_directory is required")

    candidates = [
        html_directory / f"{slug_from_url(url)}.html",
        html_directory / f"{slug_from_url(url)}.htm",
    ]
    for path in candidates:
        if path.exists():
            return path.read_text(encoding="utf-8")

    raise FileNotFoundError(
        f"No saved HTML found for {url}. Expected {candidates[0].name} or {candidates[1].name}"
    )


def slug_from_url(url: str) -> str:
    cleaned = url.strip().rstrip("/")
    if "/in/" in cleaned:
        cleaned = cleaned.split("/in/", 1)[1]
    cleaned = cleaned.replace("https://", "").replace("http://", "")
    return "".join(character if character.isalnum() else "_" for character in cleaned).strip("_")
