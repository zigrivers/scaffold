# tests/fixtures/agent-ops/resolve-template.bash
# Resolve agent-ops template placeholders the way the installer does,
# for use in bats tests (keeps bats independent of the TS build).
resolve_agent_ops_template() {
    local src="$1" dest="$2"
    sed -e 's/{{PROJECT_NAME}}/testproj/g' \
        -e 's/{{DOCKER_CONTEXT}}/default/g' \
        -e '/{{WORKTREE_SETUP_COMMANDS}}/d' \
        -e '/{{SERVICE_PORT_BANDS}}/r '"$BATS_TEST_DIRNAME"'/fixtures/agent-ops/bands.sh' \
        -e '/{{SERVICE_PORT_BANDS}}/d' \
        "$src" > "$dest"
    chmod +x "$dest"
}
