from datetime import date

from linkedin_data_appender.extractor import parse_profile_html


def test_parse_profile_html_extracts_headline_and_experience() -> None:
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

    assert profile.full_name == "Jane Candidate"
    assert profile.current_job_title == "Senior Engineer"
    assert profile.company_name == "Example Labs"
    assert profile.present_experience_months == 52
    assert profile.present_experience == "4y 4m"
    assert profile.total_experience_months == 94
    assert profile.total_experience == "7y 10m"


def test_parse_profile_html_falls_back_to_title() -> None:
    html = """
    <html>
      <head>
        <title>Sam Person - Product Manager at Acme Inc | LinkedIn</title>
      </head>
    </html>
    """

    profile = parse_profile_html(html, url="https://www.linkedin.com/in/sam-person/")

    assert profile.full_name == "Sam Person"
    assert profile.current_job_title == "Product Manager"
    assert profile.company_name == "Acme Inc"
