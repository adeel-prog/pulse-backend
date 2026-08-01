from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse, unquote
from urllib.request import Request, urlopen


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (compatible; LinkedInDataAppender/0.1.1; "
    "+https://github.com/adeel-prog/pulse-backend)"
)


@dataclass(slots=True)
class FetchResult:
    content: str
    source: str


class FetchError(RuntimeError):
    """Raised when profile HTML cannot be fetched."""


class ProfileFetcher:
    """Fetch profile HTML from local snapshots or public HTTP responses."""

    def __init__(self, timeout: float = 20.0, user_agent: str | None = None) -> None:
        self.timeout = timeout
        self.user_agent = user_agent or DEFAULT_USER_AGENT

    def fetch(self, url: str) -> FetchResult:
        if url.startswith(("http://", "https://")):
            return self._fetch_http(url)
        return self._fetch_file(url)

    def _fetch_http(self, url: str) -> FetchResult:
        request = Request(
            url,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return FetchResult(
                    content=response.read().decode(charset, errors="replace"),
                    source="http",
                )
        except HTTPError as exc:
            raise FetchError(f"HTTP {exc.code} while fetching profile") from exc
        except URLError as exc:
            raise FetchError(f"Network error while fetching profile: {exc.reason}") from exc

    @staticmethod
    def _fetch_file(path_value: str) -> FetchResult:
        parsed = urlparse(path_value)
        path = Path(unquote(parsed.path)) if parsed.scheme == "file" else Path(path_value)
        if not path.exists():
            raise FetchError(f"Profile snapshot not found: {path}")
        return FetchResult(content=path.read_text(encoding="utf-8"), source="file")


def fetch_url(
    url: str,
    *,
    timeout_seconds: float = 20.0,
    user_agent: str | None = None,
) -> str:
    fetcher = ProfileFetcher(timeout=timeout_seconds, user_agent=user_agent)
    return fetcher.fetch(url).content
