"""Check that a listing's public page shows its verify_code (proves the seller controls it).

Fetching a user-supplied URL is an SSRF risk, so: http/https only, every resolved address
must be public (re-checked on each redirect), 8s timeout, at most 2 MB read.
"""
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import requests

TIMEOUT = 8
MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
HEADERS = {"User-Agent": "MediaOwnershipCheck/1.0 (+escrow listing verification)"}


class OwnershipCheckError(Exception):
    pass


def _assert_public(url):
    parts = urlparse(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise OwnershipCheckError("Only http(s) URLs can be checked.")
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise OwnershipCheckError("The asset URL's domain does not resolve.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            raise OwnershipCheckError("The asset URL points to a private or internal address.")


def fetch_page(url):
    """Returns up to MAX_BYTES of the page body as text."""
    for _ in range(MAX_REDIRECTS + 1):
        _assert_public(url)
        try:
            resp = requests.get(url, timeout=TIMEOUT, headers=HEADERS, stream=True, allow_redirects=False)
        except requests.RequestException as e:
            raise OwnershipCheckError(f"Could not fetch the page: {e.__class__.__name__}")
        try:
            if resp.status_code in (301, 302, 303, 307, 308) and resp.headers.get("Location"):
                url = urljoin(url, resp.headers["Location"])
                continue
            if resp.status_code >= 400:
                raise OwnershipCheckError(f"The page returned HTTP {resp.status_code}.")
            body = b""
            for chunk in resp.iter_content(64 * 1024):
                body += chunk
                if len(body) >= MAX_BYTES:
                    break
            return body[:MAX_BYTES].decode(resp.encoding or "utf-8", errors="ignore")
        finally:
            resp.close()
    raise OwnershipCheckError("Too many redirects.")


def code_present(url, code):
    return code.upper() in fetch_page(url).upper()
