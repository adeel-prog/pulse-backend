# LinkedIn data appender

Small command-line and Python tool for appending candidate profile fields from
LinkedIn profile URLs. It reads an input CSV, extracts facts from each
profile's returned or saved HTML, and writes a new CSV with the original
columns plus:

- `linkedin_full_name`
- `linkedin_current_job_title`
- `linkedin_company_name`
- `linkedin_total_experience` / `linkedin_total_experience_months`
- `linkedin_present_experience_in_current_company` / `linkedin_present_experience_months`

Total experience collapses overlapping roles. Present company tenure spans
every role at the current company, not only the latest title.

## Important LinkedIn access note

LinkedIn often requires login, blocks automated traffic, and may hide profile
details from public HTML. This tool does not bypass authentication, CAPTCHA,
robots controls, or anti-bot systems. It only parses data that is legitimately
returned to the HTTP client or available in saved HTML fixtures.

For production use, prefer an approved data provider or official LinkedIn API
access where your use case and user consent are covered.

## Install

```bash
python3 -m pip install -e .
```

## CSV input

The input file must contain a column with the candidate LinkedIn URL. By
default the tool auto-detects common names such as `linkedin_url`,
`linkedin_profile`, and `candidate_linkedin_url`.

```csv
candidate_id,linkedin_url
123,https://www.linkedin.com/in/example-candidate/
```

## Usage

Append fields for every row in a CSV:

```bash
linkedin-data-appender candidates.csv enriched_candidates.csv
```

Use a different URL column:

```bash
linkedin-data-appender candidates.csv enriched_candidates.csv --url-column profile_url
```

Control request timeout and polite delay between HTTP fetches:

```bash
linkedin-data-appender candidates.csv enriched_candidates.csv --timeout 20 --delay 1.5
```

Parse saved LinkedIn HTML files without making network requests. The tool looks
for files based on the URL slug, so
`https://www.linkedin.com/in/jane-doe/` maps to `jane-doe.html`:

```bash
linkedin-data-appender candidates.csv enriched_candidates.csv --html-dir ./saved_profiles
```

Enrich a single URL and print JSON. Prefer `--html-file` or `--html-dir` so the
run does not depend on a live LinkedIn response:

```bash
python3 -m linkedin_data_appender --url https://www.linkedin.com/in/jane-doe/ --html-file ./saved_profiles/jane_doe.html
```

## Python API

```python
from linkedin_data_appender import enrich_candidate, append_linkedin_data

profile = enrich_candidate(
    "https://www.linkedin.com/in/jane-doe/",
    html_directory="./saved_profiles",
)
print(profile.full_name, profile.current_job_title, profile.company_name)

append_linkedin_data("candidates.csv", "enriched_candidates.csv", html_directory="./saved_profiles")
```

## Development

```bash
python3 -m unittest discover -s tests
python3 -m linkedin_data_appender --help
```
