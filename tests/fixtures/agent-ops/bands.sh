# tests/fixtures/agent-ops/bands.sh
# Fixture data spliced into resolved templates at {{SERVICE_PORT_BANDS}};
# the variables are consumed by the resolved script, not this file.
# shellcheck disable=SC2034
# NOTE: redis-cache is a DASH-named service — the generated BAND_/SHARED_ vars use
# the `-`→`_` transform (BAND_redis_cache), matching buildTemplateVars. SERVICES
# keeps the raw dash form; the script re-derives the safe suffix per service.
SERVICES="postgres api redis-cache"
BAND_postgres=20000
BAND_api=21000
BAND_redis_cache=22000
SHARED_postgres=55432
SHARED_api=8001
SHARED_redis_cache=6379
