from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from spaceapp_logar.dashboard import DashboardFiles


def _client(dist: Path) -> TestClient:
    app = FastAPI()
    app.mount("/ui", DashboardFiles(dist), name="ui")
    return TestClient(app)


def test_missing_build_serves_fallback_page(tmp_path: Path) -> None:
    client = _client(tmp_path / "does-not-exist")

    for path in ("/ui/", "/ui/assets/app.js"):
        page = client.get(path)
        assert page.status_code == 200
        assert page.headers["content-type"].startswith("text/html")
        assert "npm ci &amp;&amp; npm run build" in page.text
        assert "SpaceApp Logar" in page.text


def test_built_app_is_served_with_cache_headers(tmp_path: Path) -> None:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text('<title>SpaceApp Logar</title><div id="root"></div>', encoding="utf-8")
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    client = _client(tmp_path)

    page = client.get("/ui/")
    asset = client.get("/ui/assets/index-abc123.js")

    assert page.status_code == 200
    assert 'id="root"' in page.text
    assert page.headers["cache-control"] == "no-cache"
    assert asset.status_code == 200
    assert "immutable" in asset.headers["cache-control"]
    assert client.get("/ui/assets/missing.js").status_code == 404
