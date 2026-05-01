from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (compatible; LinkedInDataAppender/0.1; "
    "+https://example.invalid/linkedin-data-appender)"
)


@dataclass(slots=True)
class FetchResult:
    content: str
    source: str


class ProfileFetcher:
    """Fetch profile HTML from local snapshots or public HTTP responses."""

    def __init__(self, timeout: int = 20, user_agent: str = DEFAULT_USER_AGENT) -> None:
        self.timeout = timeout
        self.user_agent = user_agent

    def fetch(self, url: str) -> FetchResult:
        if url.startswith(("http://", "https://")):
            return self._fetch_http(url)
        return self._fetch_file(url)

    def _fetch_http(self, url: str) -> FetchResult:
        request = Request(url, headers={"User-Agent": self.user_agent})
        try:
            with urlopen(request, timeout=self.timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return FetchResult(
                    content=response.read().decode(charset, errors="replace"),
                    source="http",
                )
        except HTTPError as exc:
            raise RuntimeError(f"HTTP {exc.code} while fetching profile") from exc
        except URLError as exc:
            raise RuntimeError(f"Network error while fetching profile: {exc.reason}") from exc

    @staticmethod
    def _fetch_file(path_value: str) -> FetchResult:
        path = Path(path_value)
        if not path.exists():
            raise RuntimeError(f"Profile snapshot not found: {path}")
        return FetchResult(content=path.read_text(encoding="utf-8"), source="file")
