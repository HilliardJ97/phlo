#!/usr/bin/env bash
# Runs the settle eval across models on OpenRouter in parallel (cloud, cents per run).
# Needs an OpenRouter key: in this cloud env it's proxy-injected; locally export PHLO_API_KEY.
set -u
cd "$(dirname "$0")/.."
export PHLO_BASE_URL=${PHLO_BASE_URL:-https://openrouter.ai/api/v1} PHLO_API_KEY=${PHLO_API_KEY:-proxy-injected}
export NODE_USE_ENV_PROXY=${NODE_USE_ENV_PROXY:-1} NODE_NO_WARNINGS=1
[ -f /root/.ccr/ca-bundle.crt ] && export NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt
MODE=${PHLO_MODE:-full}
REASONING=${PHLO_REASONING:-low}
MODELS=${MODELS:-"openai/gpt-6-luna openai/gpt-6.1-sol anthropic/claude-haiku-5.5 anthropic/claude-sonnet-5.5 openai/gpt-oss-120b qwen/qwen3-235b-a22b-2507 deepseek/deepseek-v4-flash google/gemini-3.5-flash"}
mkdir -p evals/out/sweep
for m in $MODELS; do
  f="evals/out/sweep/$(echo "$m" | tr '/:' '__')-$MODE-$REASONING.log"
  # One model at a time by default: free-tier keys have a small in-flight budget. PARALLEL=1 to fan out.
  if [ "${PARALLEL:-0}" = "1" ]; then
    PHLO_MODEL="$m" PHLO_MODE="$MODE" PHLO_REASONING="$REASONING" npx tsx evals/run.ts --open > "$f" 2>&1 &
  else
    PHLO_MODEL="$m" PHLO_MODE="$MODE" PHLO_REASONING="$REASONING" npx tsx evals/run.ts --open > "$f" 2>&1
    printf "%-60s %s\n" "$(basename "$f" .log)" "$(grep '^checks' "$f")"
  fi
done
wait
for f in evals/out/sweep/*-$MODE-$REASONING.log; do printf "%-60s %s\n" "$(basename "$f" .log)" "$(grep '^checks' "$f")"; done
