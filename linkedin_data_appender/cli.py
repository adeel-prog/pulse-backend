from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .appender import append_linkedin_data, enrich_candidate, profile_to_json


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Append candidate profile fields from LinkedIn URLs. "
            "Provide an input/output CSV pair, or use --url for a single profile."
        )
    )
    parser.add_argument(
        "input_csv",
        type=Path,
        nargs="?",
        help="CSV file containing candidate rows.",
    )
    parser.add_argument(
        "output_csv",
        type=Path,
        nargs="?",
        help="Destination CSV file with appended fields.",
    )
    parser.add_argument(
        "--url",
        help="Enrich a single LinkedIn profile URL and print JSON.",
    )
    parser.add_argument(
        "--url-column",
        help=(
            "Input CSV column containing the LinkedIn profile URL. "
            "When omitted, common LinkedIn column names are auto-detected."
        ),
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
        "--html-file",
        type=Path,
        help="Saved profile HTML file to use with --url.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=20.0,
        help="HTTP request timeout in seconds. Defaults to 20.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help=(
            "Seconds to wait between HTTP profile fetches. "
            "Defaults to 1.0. Ignored when --html-dir is used."
        ),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.url:
        html = args.html_file.read_text(encoding="utf-8") if args.html_file else None
        profile = enrich_candidate(
            args.url,
            html=html,
            html_directory=args.html_dir,
            timeout_seconds=args.timeout,
        )
        sys.stdout.write(profile_to_json(profile) + "\n")
        return 1 if profile.error else 0

    if args.input_csv is None or args.output_csv is None:
        parser.error("input_csv and output_csv are required unless --url is provided")

    append_linkedin_data(
        input_csv=args.input_csv,
        output_csv=args.output_csv,
        url_column=args.url_column,
        html_directory=args.html_dir,
        timeout_seconds=args.timeout,
        delay_seconds=args.delay,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
