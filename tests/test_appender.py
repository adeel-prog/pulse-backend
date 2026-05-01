import csv
import tempfile
import unittest
from pathlib import Path

from linkedin_data_appender.appender import append_linkedin_data
from linkedin_data_appender.models import CandidateProfile


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


if __name__ == "__main__":
    unittest.main()
