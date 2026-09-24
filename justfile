#!/usr/bin/env just --justfile

run_cmd := "docker compose"

[private]
default:
    @just --list

[group('run')]
run:
    {{ run_cmd }} up --build app

[group('run')]
stop:
    {{ run_cmd }} stop -t 1 app

[group('Tests')]
test *arg:
    {{ run_cmd }} run --rm app npm test -- {{ arg }}

[group('Lint')]
lint:
    {{ run_cmd }} run --rm app sh -c "npm run typecheck && npm run lint && npx prettier --check ."
