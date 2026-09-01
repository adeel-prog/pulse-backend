import unittest
from datetime import date
from pathlib import Path

from linkedin_data_appender.extractor import parse_profile_html
from linkedin_data_appender.models import (
    Experience,
    company_tenure_months,
    format_months,
    merge_experience_months,
)


FIXTURES = Path(__file__).parent / "fixtures"


class ParseProfileHtmlTest(unittest.TestCase):
    def test_extracts_headline_and_experience(self) -> None:
        html = """
        <html>
          <head>
            <title>Jane Candidate - Senior Engineer at Example Labs | LinkedIn</title>
            <meta property="og:title" content="Jane Candidate - Senior Engineer at Example Labs | LinkedIn">
            <script type="application/ld+json">
            {
              "@type": "Person",
              "name": "Jane Candidate",
              "jobTitle": "Senior Engineer",
              "worksFor": {"name": "Example Labs"}
            }
            </script>
          </head>
          <body>
            Senior Engineer at Example Labs Jan 2022 - Present
            Software Engineer at Earlier Co Jun 2019 - Dec 2021
          </body>
        </html>
        """

        profile = parse_profile_html(
            html,
            url="https://www.linkedin.com/in/jane-candidate/",
            fetched_at=date(2026, 5, 1),
        )

        self.assertEqual(profile.full_name, "Jane Candidate")
        self.assertEqual(profile.current_job_title, "Senior Engineer")
        self.assertEqual(profile.company_name, "Example Labs")
        self.assertEqual(profile.present_experience_months, 52)
        self.assertEqual(profile.as_dict()["present_experience_in_current_company"], "4 years 4 months")
        self.assertEqual(profile.total_experience_months, 82)
        self.assertEqual(profile.as_dict()["total_experience"], "6 years 10 months")

    def test_falls_back_to_title(self) -> None:
        html = """
        <html>
          <head>
            <title>Sam Person - Product Manager at Acme Inc | LinkedIn</title>
          </head>
        </html>
        """

        profile = parse_profile_html(html, url="https://www.linkedin.com/in/sam-person/")

        self.assertEqual(profile.full_name, "Sam Person")
        self.assertEqual(profile.current_job_title, "Product Manager")
        self.assertEqual(profile.company_name, "Acme Inc")

    def test_present_experience_spans_all_roles_at_current_company(self) -> None:
        html = """
        <html>
          <head>
            <title>Alex Doe - Staff Engineer at Example Labs | LinkedIn</title>
          </head>
          <body>
            Staff Engineer at Example Labs Jan 2024 - Present
            Senior Engineer at Example Labs Jan 2022 - Dec 2023
            Engineer at Earlier Co Jan 2020 - Dec 2021
          </body>
        </html>
        """

        profile = parse_profile_html(
            html,
            url="https://www.linkedin.com/in/alex-doe/",
            fetched_at=date(2026, 5, 1),
        )

        self.assertEqual(profile.company_name, "Example Labs")
        self.assertEqual(profile.current_job_title, "Staff Engineer")
        # Jan 2022 through May 2026 across both Example Labs roles.
        self.assertEqual(profile.present_experience_months, 52)
        self.assertEqual(
            profile.as_dict()["present_experience_in_current_company"],
            "4 years 4 months",
        )

    def test_does_not_truncate_company_name_before_date(self) -> None:
        html = """
        <html>
          <body>
            Senior Engineer at Example Labs Jan 2022 - Present
          </body>
        </html>
        """

        profile = parse_profile_html(
            html,
            url="https://www.linkedin.com/in/jane-candidate/",
            fetched_at=date(2026, 5, 1),
        )

        self.assertEqual(profile.company_name, "Example Labs")
        self.assertNotEqual(profile.company_name, "Ex")

    def test_extracts_stacked_experience_blocks(self) -> None:
        html = """
        <html>
          <head>
            <title>Alex Doe - Staff Engineer at Example Labs | LinkedIn</title>
          </head>
          <body>
            <div>Staff Engineer</div>
            <div>Example Labs</div>
            <div>Jan 2024 - Present · 2 yrs 4 mos</div>
            <div>Senior Engineer</div>
            <div>Example Labs</div>
            <div>Jan 2022 - Dec 2023</div>
          </body>
        </html>
        """

        profile = parse_profile_html(
            html,
            url="https://www.linkedin.com/in/alex-doe/",
            fetched_at=date(2026, 5, 1),
        )

        self.assertEqual(profile.current_job_title, "Staff Engineer")
        self.assertEqual(profile.company_name, "Example Labs")
        self.assertEqual(profile.present_experience_months, 52)

    def test_reads_json_ld_graph_and_works_for_list(self) -> None:
        html = (FIXTURES / "jane_candidate.html").read_text(encoding="utf-8")

        profile = parse_profile_html(
            html,
            url="https://www.linkedin.com/in/jane-candidate/",
            fetched_at=date(2026, 5, 1),
        )

        self.assertEqual(profile.full_name, "Jane Candidate")
        self.assertEqual(profile.current_job_title, "Senior Engineer")
        self.assertEqual(profile.company_name, "Example Labs")
        self.assertEqual(profile.present_experience_months, 52)
        self.assertEqual(profile.total_experience_months, 82)

    def test_merge_experience_months_collapses_overlaps(self) -> None:
        experiences = [
            Experience(
                title="Engineer",
                company="Acme",
                start=date(2020, 1, 1),
                end=date(2022, 6, 1),
            ),
            Experience(
                title="Consultant",
                company="Other",
                start=date(2021, 1, 1),
                end=date(2023, 1, 1),
            ),
        ]

        self.assertEqual(merge_experience_months(experiences), 36)

    def test_company_tenure_and_format_months(self) -> None:
        experiences = [
            Experience(
                title="Staff Engineer",
                company="Example Labs",
                start=date(2024, 1, 1),
                end=date(2026, 5, 1),
                is_current=True,
            ),
            Experience(
                title="Senior Engineer",
                company="Example Labs",
                start=date(2022, 1, 1),
                end=date(2023, 12, 1),
            ),
        ]

        self.assertEqual(company_tenure_months(experiences, "Example Labs"), 52)
        self.assertEqual(format_months(52), "4 years 4 months")
        self.assertEqual(format_months(1), "1 month")
        self.assertEqual(format_months(12), "1 year")
        self.assertEqual(format_months(0), "0 months")
        self.assertEqual(format_months(None), "")


if __name__ == "__main__":
    unittest.main()
