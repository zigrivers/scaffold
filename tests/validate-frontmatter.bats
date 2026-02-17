#!/usr/bin/env bats

# Tests for scripts/validate-frontmatter.sh

SCRIPT="$BATS_TEST_DIRNAME/../scripts/validate-frontmatter.sh"
FIXTURES="$BATS_TEST_DIRNAME/fixtures"

setup() {
    # Create fixture files for each test run
    mkdir -p "$FIXTURES"
}

teardown() {
    # Clean up generated fixtures
    rm -f "$FIXTURES"/frontmatter-*.md
}

@test "passes for file with valid frontmatter and description" {
    cat > "$FIXTURES/frontmatter-valid.md" << 'EOF'
---
description: "A valid command description"
---

# Content here
EOF
    run "$SCRIPT" "$FIXTURES/frontmatter-valid.md"
    [ "$status" -eq 0 ]
}

@test "passes for file with description and argument-hint" {
    cat > "$FIXTURES/frontmatter-with-hint.md" << 'EOF'
---
description: "A valid command description"
argument-hint: "<idea or @files>"
---

# Content here
EOF
    run "$SCRIPT" "$FIXTURES/frontmatter-with-hint.md"
    [ "$status" -eq 0 ]
}

@test "fails for file missing description field" {
    cat > "$FIXTURES/frontmatter-no-desc.md" << 'EOF'
---
argument-hint: "<something>"
---

# Content here
EOF
    run "$SCRIPT" "$FIXTURES/frontmatter-no-desc.md"
    [ "$status" -eq 1 ]
    [[ "$output" == *"missing 'description' field"* ]]
}

@test "fails for file with no frontmatter at all" {
    cat > "$FIXTURES/frontmatter-none.md" << 'EOF'
# Just a markdown file

No frontmatter here.
EOF
    run "$SCRIPT" "$FIXTURES/frontmatter-none.md"
    [ "$status" -eq 1 ]
    [[ "$output" == *"no YAML frontmatter found"* ]]
}

@test "passes when all multiple files are valid" {
    cat > "$FIXTURES/frontmatter-multi1.md" << 'EOF'
---
description: "First command"
---
EOF
    cat > "$FIXTURES/frontmatter-multi2.md" << 'EOF'
---
description: "Second command"
---
EOF
    run "$SCRIPT" "$FIXTURES/frontmatter-multi1.md" "$FIXTURES/frontmatter-multi2.md"
    [ "$status" -eq 0 ]
}

@test "fails when one of multiple files is invalid" {
    cat > "$FIXTURES/frontmatter-good.md" << 'EOF'
---
description: "Good file"
---
EOF
    cat > "$FIXTURES/frontmatter-bad.md" << 'EOF'
---
argument-hint: "<thing>"
---
EOF
    run "$SCRIPT" "$FIXTURES/frontmatter-good.md" "$FIXTURES/frontmatter-bad.md"
    [ "$status" -eq 1 ]
    [[ "$output" == *"frontmatter-bad.md"* ]]
}

@test "exits with code 2 when no arguments provided" {
    run "$SCRIPT"
    [ "$status" -eq 2 ]
    [[ "$output" == *"Usage:"* ]]
}

@test "fails for file that does not exist" {
    run "$SCRIPT" "$FIXTURES/nonexistent.md"
    [ "$status" -eq 1 ]
    [[ "$output" == *"not found"* ]]
}

@test "handles description with unquoted value" {
    cat > "$FIXTURES/frontmatter-unquoted.md" << 'EOF'
---
description: A valid unquoted description
---

# Content
EOF
    run "$SCRIPT" "$FIXTURES/frontmatter-unquoted.md"
    [ "$status" -eq 0 ]
}
