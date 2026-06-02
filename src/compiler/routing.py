"""
routing.py - Config-driven model routing for OneAtlas AppSpec Engine
─────────────────────────────────────────────────────────────────────
Loads routing.yaml once at import time. Provides:
  - _model_for_stage(stage)  -> (primary_model, fallback_model, temperature)
  - _cost_for_tokens(model, input_tokens, output_tokens) -> float USD
  - ROUTING_CONFIG  (full parsed config dict, for logging/introspection)

This is the single place where model names are defined.
crew.py reads from here — no hardcoded model strings in pipeline code.
"""

from __future__ import annotations
import logging
import os
import yaml

logger = logging.getLogger("protoflow.routing")

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "routing.yaml")

def _load_config() -> dict:
    with open(_CONFIG_PATH, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    logger.info("[routing] Loaded routing config from %s", _CONFIG_PATH)
    return cfg

ROUTING_CONFIG: dict = _load_config()
_STAGES: dict = ROUTING_CONFIG.get("stages", {})
_COST_TABLE: dict = ROUTING_CONFIG.get("cost_table", {})

# Log routing table at startup so misconfigurations are caught early
for stage, conf in _STAGES.items():
    logger.info("[routing] %-25s primary=%-45s fallback=%s",
                stage, conf.get("primary", "MISSING"), conf.get("fallback", "MISSING"))


def _model_for_stage(stage: str) -> tuple[str, str, float]:
    """
    Return (primary_model, fallback_model, temperature) for a pipeline stage.
    Stage names mirror the keys in routing.yaml stages block.
    Falls back to groq default if stage not configured.
    """
    conf = _STAGES.get(stage, {})
    primary  = conf.get("primary",  "groq/llama-3.3-70b-versatile")
    fallback = conf.get("fallback", "openrouter/meta-llama/llama-3.3-70b-instruct")
    temp     = float(conf.get("temperature", 0.2))
    return primary, fallback, temp


def _cost_for_tokens(model: str, input_tokens: int, output_tokens: int) -> float:
    """
    Estimate USD cost for a model call.
    Uses COST_TABLE from routing.yaml. Returns 0.0 if model not in table.
    """
    rates = _COST_TABLE.get(model, {})
    if not rates:
        # Try prefix match (e.g. "groq/llama-3.3-70b-versatile" matches "groq/llama-3.3-70b")
        for key, val in _COST_TABLE.items():
            if model.startswith(key) or key.startswith(model):
                rates = val
                break
    if not rates:
        return 0.0
    return (input_tokens * rates.get("input", 0.0) +
            output_tokens * rates.get("output", 0.0))