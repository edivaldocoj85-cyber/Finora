"""Ponto de entrada da Vercel: expõe o mesmo app FastAPI usado no deploy via Docker.
A Vercel detecta a variável `app` (ASGI) automaticamente no runtime @vercel/python."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402
