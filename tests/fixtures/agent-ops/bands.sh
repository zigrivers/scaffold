# tests/fixtures/agent-ops/bands.sh
# Fixture data spliced into resolved templates at {{SERVICE_PORT_BANDS}};
# the variables are consumed by the resolved script, not this file.
# shellcheck disable=SC2034
SERVICES="postgres api"
BAND_postgres=20000
BAND_api=21000
SHARED_postgres=55432
SHARED_api=8001
