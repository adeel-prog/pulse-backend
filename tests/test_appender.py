from __future__ import annotations

import csv
from pathlib import Path

from linkedin_data_appender.appender import append_linkedin_data
from linkedin_data_appender.models import CandidateProfile


def test_append_linkedin_data_adds_profile_columns(tmp_path: Path) -> None:
    input_path = tmp_path / "input.csv"
    output_path = tmp_path / "output.csv"
    html_path = tmp_path / "profile.html"
    html_path.write_text("<html><title>Local Person - Founder at LocalCo | LinkedIn</title></html>")

    input_path.write_text(
        "candidate_id,linkedin_url\n"
        f"1,{html_path.as_uri()}\n",
        newline="",
    )

    append_linkedin_data(input_path, output_path)

    with output_path.open(newline="") as handle:
        rows = list(csv.DictReader(handle))

    assert len(rows) == 1
    assert rows[0]["candidate_id"] == "1"
    assert rows[0]["linkedin_full_name"] == "Local Person"
    assert rows[0]["linkedin_current_job_title"] == "Founder"
    assert rows[0]["linkedin_company_name"] == "LocalCo"
    assert rows[0]["linkedin_source"] == "html"


def test_append_linkedin_data_supports_injected_fetcher(tmp_path: Path) -> None:
    input_path = tmp_path / "input.csv"
    output_path = tmp_path / "output.csv"
    input_path.write_text(
        "linkedin_url\nhttps://www.linkedin.com/in/example\n",
        newline="",
    )

    def fetcher(url: str) -> CandidateProfile:
        return CandidateProfile(
            linkedin_url=url,
            full_name="Injected Person",
            current_job_title="Engineer",
            company_name="Example Inc",
            source="test",
        )

    append_linkedin_data(input_path, output_path, fetcher=fetcher)

    with output_path.open(newline="") as handle:
        [row] = list(csv.DictReader(handle))

    assert row["linkedin_full_name"] == "Injected Person"
    assert row["linkedin_current_job_title"] == "Engineer"
    assert row["linkedin_company_name"] == "Example Inc"
    assert row["linkedin_source"] == "test"
