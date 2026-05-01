from __future__ import annotations

import argparse
from pathlib import Path

from .appender import append_linkedin_data


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Append candidate profile fields from LinkedIn URLs to a CSV file."
    )
    parser.add_argument("input_csv", type=Path, help="CSV file containing candidate rows.")
    parser.add_argument("output_csv", type=Path, help="Destination CSV file with appended fields.")
    parser.add_argument(
        "--url-column",
        default="linkedin_url",
        help="Input CSV column containing the LinkedIn profile URL. Defaults to linkedin_url.",
    )
    parser.add_argument(
        "--html-dir",
        type=Path,
        help=(
            "Directory containing saved LinkedIn profile HTML files. "
            "When set, the tool reads local HTML instead of making HTTP requests."
        ),
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=20.0,
        help="HTTP request timeout in seconds. Defaults to 20.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    append_linkedin_data(
        input_csv=args.input_csv,
        output_csv=args.output_csv,
        url_column=args.url_column,
        html_directory=args.html_dir,
        timeout_seconds=args.timeout,
    )


if __name__ == "__main__":
    main()
