import pytest

from spaceapp_logar.db.session import database_url_from_env, normalize_database_url


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("postgres://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
        ("postgresql://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
        ("postgresql+psycopg://u@h/db", "postgresql+psycopg://u@h/db"),
        ("sqlite:///./x.db", "sqlite:///./x.db"),
    ],
)
def test_normalize_database_url(given: str, expected: str) -> None:
    assert normalize_database_url(given) == expected


def test_url_precedence(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SPACEAPP_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert database_url_from_env().startswith("sqlite:///")

    monkeypatch.setenv("DATABASE_URL", "postgres://render@h/db")
    assert database_url_from_env() == "postgresql+psycopg://render@h/db"

    monkeypatch.setenv("SPACEAPP_DATABASE_URL", "sqlite:///./override.db")
    assert database_url_from_env() == "sqlite:///./override.db"
