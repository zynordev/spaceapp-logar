"""Serve the built React dashboard (``frontend/dist``) under ``/ui/``.

The build output is produced by ``cd frontend && npm ci && npm run build``
(the Docker image does this in a Node stage). When it is missing — e.g. a
Python-only checkout or CI job — ``/ui/`` still answers 200 with a small
built-in page that explains how to build it, so the API stays usable.
"""

import os
from pathlib import Path

from starlette.responses import HTMLResponse, Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

DEFAULT_UI_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
UI_DIST = Path(os.getenv("SPACEAPP_UI_DIST", str(DEFAULT_UI_DIST)))

FALLBACK_HTML = """<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>SpaceApp Logar — arayüz derlenmemiş</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #060a14; color: #e9eefb;
         font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 640px; margin: 24px; padding: 28px 32px; border-radius: 14px;
         background: #0f1729; border: 1px solid #263556; }
  h1 { margin: 0 0 8px; font-size: 1.4rem; }
  p { color: #a9b6d3; }
  pre { padding: 12px 16px; border-radius: 10px; background: #060a14; border: 1px solid #3a4d78;
        color: #8ad8ff; overflow-x: auto; }
  a { color: #5cc8ff; }
  .note { font-size: .85rem; color: #8391b2; border-top: 1px solid #263556; padding-top: 12px; }
</style>
</head>
<body>
<main>
  <h1>SpaceApp Logar — arayüz henüz derlenmemiş</h1>
  <p>API çalışıyor, ancak gösterge paneli (<code>frontend/dist</code>) bulunamadı.
     Depo kökünde şunu çalıştırın ve sayfayı yenileyin:</p>
  <pre>cd frontend &amp;&amp; npm ci &amp;&amp; npm run build</pre>
  <p lang="en">The API is running but the dashboard build is missing. Run the command above
     (Node 22+) and reload. Docker images include the build.</p>
  <p><a href="/docs">API belgeleri (/docs)</a> · <a href="/health">Sağlık (/health)</a></p>
  <p class="note">Prototip karar-destek aracıdır. Teşhis koymaz, tedavi önermez.</p>
</main>
</body>
</html>
"""


class DashboardFiles(StaticFiles):
    """StaticFiles for the SPA build with a built-in page when it is missing."""

    def __init__(self, directory: Path) -> None:
        self.dist = directory
        super().__init__(directory=directory, html=True, check_dir=False)

    def built(self) -> bool:
        return (self.dist / "index.html").is_file()

    async def check_config(self) -> None:
        # Without a build the directory may not exist: get_response serves the
        # fallback page instead of StaticFiles raising "directory does not exist".
        if self.built():
            await super().check_config()

    async def get_response(self, path: str, scope: Scope) -> Response:
        if not self.built():
            return HTMLResponse(FALLBACK_HTML, headers={"Cache-Control": "no-store"})
        response = await super().get_response(path, scope)
        # Vite emits content-hashed assets: cache them forever; never cache
        # index.html so a new build is picked up on the next load.
        if path.replace("\\", "/").startswith("assets/") and response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-cache"
        return response
