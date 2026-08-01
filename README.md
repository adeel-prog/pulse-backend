# LinkedIn data appender

Small command line tool for appending candidate profile fields to a CSV from
candidate LinkedIn profile URLs.

The tool reads an input CSV, fetches each LinkedIn URL, extracts profile facts
available in the returned HTML, and writes a new CSV containing the original
columns plus:

- `linkedin_linkedin_url`
- `linkedin_full_name`
- `linkedin_current_job_title`
- `linkedin_total_experience_months`
- `linkedin_total_experience`
- `linkedin_present_experience_months`
- `linkedin_present_experience_in_current_company`
- `linkedin_company_name`
- `linkedin_raw_headline`
- `linkedin_source`
- `linkedin_error`

## Important LinkedIn access note

LinkedIn often requires login, blocks automated traffic, and may hide profile
details from public HTML. This tool does not bypass authentication, CAPTCHA,
robots controls, or anti-bot systems. It only parses data that is legitimately
returned to the HTTP client or available in saved HTML fixtures.

For production use, prefer an approved data provider or LinkedIn API access
where your use case and user consent are covered.

## Install

```bash
python3 -m pip install -e .
```

## CSV input

The input file must contain a column with the candidate LinkedIn URL. By
default the tool auto-detects common names such as `linkedin_url`,
`linkedin_profile`, and `candidate_linkedin_url`.

Example:

```csv
candidate_id,linkedin_url
123,https://www.linkedin.com/in/example-candidate/
```

## Usage

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

Parse saved LinkedIn HTML files without making network requests:

```bash
linkedin-data-appender candidates.csv enriched_candidates.csv --html-dir ./saved_profiles
```

When `--html-dir` is used, the tool looks for files based on the URL slug, for
example `https://www.linkedin.com/in/jane-doe/` maps to `jane-doe.html`.

## Development

Run tests with:

```bash
python3 -m unittest discover -s tests
```
