import os

# API tests swap the session dependency for their own migrated temporary
# databases, while the schema guard looks at the process-wide engine. The
# guard is exercised explicitly in tests/test_observability.py.
os.environ.setdefault("SPACEAPP_SCHEMA_GUARD", "off")
os.environ.setdefault("SPACEAPP_LOG_LEVEL", "WARNING")
