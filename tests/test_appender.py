import csv
import io
import json
import tempfile
import unittest
import unittest.mock
from pathlib import Path

from linkedin_data_appender.appender import (
    append_linkedin_data,
    enrich_candidate,
    is_linkedin_profile_url,
    slug_from_url,
)
from linkedin_data_appender.cli import build_parser, main
from linkedin_data_appender.fetcher import DEFAULT_USER_AGENT, ProfileFetcher
from linkedin_data_appender.models import CandidateProfile


FIXTURES = Path(__file__).parent / "fixtures"


class AppenderTests(unittest.TestCase):
    def test_append_linkedin_data_adds_profile_columns(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / "input.csv"
            output_path = temp_path / "output.csv"
            html_path = temp_path / "profile.html"
            html_path.write_text(
                "<html><title>Local Person - Founder at LocalCo | LinkedIn</title></html>",
                encoding="utf-8",
            )

            input_path.write_text(
                "candidate_id,linkedin_url\n"
                f"1,{html_path}\n",
                newline="",
                encoding="utf-8",
            )

            append_linkedin_data(input_path, output_path)

            with output_path.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))

            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["candidate_id"], "1")
            self.assertEqual(rows[0]["linkedin_full_name"], "Local Person")
            self.assertEqual(rows[0]["linkedin_current_job_title"], "Founder")
            self.assertEqual(rows[0]["linkedin_company_name"], "LocalCo")
            self.assertEqual(rows[0]["linkedin_source"], "file")

    def test_append_linkedin_data_supports_injected_fetcher(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / "input.csv"
            output_path = temp_path / "output.csv"
            input_path.write_text(
                "linkedin_url\nhttps://www.linkedin.com/in/example\n",
                newline="",
                encoding="utf-8",
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

            with output_path.open(newline="", encoding="utf-8") as handle:
                [row] = list(csv.DictReader(handle))

            self.assertEqual(row["linkedin_full_name"], "Injected Person")
            self.assertEqual(row["linkedin_current_job_title"], "Engineer")
            self.assertEqual(row["linkedin_company_name"], "Example Inc")
            self.assertEqual(row["linkedin_source"], "test")

    def test_append_linkedin_data_auto_detects_candidate_linkedin_url(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / "input.csv"
            output_path = temp_path / "output.csv"
            input_path.write_text(
                "candidate_linkedin_url\nhttps://www.linkedin.com/in/example\n",
                newline="",
                encoding="utf-8",
            )

            append_linkedin_data(
                input_path,
                output_path,
                fetcher=lambda url: CandidateProfile(
                    linkedin_url=url,
                    full_name="Auto Detected",
                ),
            )

            with output_path.open(newline="", encoding="utf-8") as handle:
                [row] = list(csv.DictReader(handle))

            self.assertEqual(row["linkedin_full_name"], "Auto Detected")

    def test_append_linkedin_data_from_html_dir(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / "input.csv"
            output_path = temp_path / "output.csv"
            input_path.write_text(
                "linkedin_url\nhttps://www.linkedin.com/in/jane-doe/?trk=people\n",
                newline="",
                encoding="utf-8",
            )

            append_linkedin_data(input_path, output_path, html_directory=FIXTURES)

            with output_path.open(newline="", encoding="utf-8") as handle:
                [row] = list(csv.DictReader(handle))

            self.assertEqual(row["linkedin_full_name"], "Jane Doe")
            self.assertEqual(row["linkedin_current_job_title"], "Designer")
            self.assertEqual(row["linkedin_company_name"], "Studio")
            self.assertEqual(row["linkedin_source"], "html")

    def test_enrich_candidate_from_html_string(self) -> None:
        profile = enrich_candidate(
            "https://www.linkedin.com/in/local-person/",
            html="<html><title>Local Person - Founder at LocalCo | LinkedIn</title></html>",
        )

        self.assertEqual(profile.full_name, "Local Person")
        self.assertEqual(profile.current_job_title, "Founder")
        self.assertEqual(profile.company_name, "LocalCo")
        self.assertEqual(profile.source, "html")

    def test_rejects_non_linkedin_http_urls(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / "input.csv"
            output_path = temp_path / "output.csv"
            input_path.write_text(
                "linkedin_url\nhttps://example.com/not-linkedin\n",
                newline="",
                encoding="utf-8",
            )

            append_linkedin_data(input_path, output_path)

            with output_path.open(newline="", encoding="utf-8") as handle:
                [row] = list(csv.DictReader(handle))

            self.assertEqual(row["linkedin_source"], "error")
            self.assertIn("not a LinkedIn profile", row["linkedin_error"])

    def test_cli_defaults(self) -> None:
        args = build_parser().parse_args(["input.csv", "output.csv"])

        self.assertIsNone(args.url_column)
        self.assertEqual(args.delay, 1.0)
        self.assertEqual(args.timeout, 20.0)

    def test_cli_single_url_prints_json(self) -> None:
        html_file = FIXTURES / "jane_doe.html"
        stdout = io.StringIO()
        with unittest.mock.patch("sys.stdout", stdout):
            exit_code = main(
                [
                    "--url",
                    "https://www.linkedin.com/in/jane-doe/",
                    "--html-file",
                    str(html_file),
                ]
            )

        payload = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertEqual(payload["full_name"], "Jane Doe")
        self.assertEqual(payload["current_job_title"], "Designer")
        self.assertEqual(payload["company_name"], "Studio")

    def test_profile_fetcher_uses_default_user_agent_when_none(self) -> None:
        fetcher = ProfileFetcher(user_agent=None)

        self.assertEqual(fetcher.user_agent, DEFAULT_USER_AGENT)

    def test_slug_from_url_strips_query_and_fragment(self) -> None:
        self.assertEqual(
            slug_from_url("https://www.linkedin.com/in/jane-doe/?trk=people#about"),
            "jane_doe",
        )

    def test_is_linkedin_profile_url(self) -> None:
        self.assertTrue(is_linkedin_profile_url("https://www.linkedin.com/in/jane-doe/"))
        self.assertTrue(is_linkedin_profile_url("https://uk.linkedin.com/in/jane-doe/"))
        self.assertFalse(is_linkedin_profile_url("https://www.linkedin.com/company/acme/"))
        self.assertFalse(is_linkedin_profile_url("https://example.com/in/jane-doe/"))


if __name__ == "__main__":
    unittest.main()
