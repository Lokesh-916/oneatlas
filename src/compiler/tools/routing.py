"""
routing.py - Provider routing loader for OneAtlas AppSpec Engine

Reads src/compiler/config/routing.yaml at startup (once).
Exposes two functions used in crew.py:
  model_for_stage(stage)  -> (primary_model, fallback_model, temperature)
  cost_for_tokens(model, input_tokens, output_tokens) -> float (USD)

No classes, no plugins, no abstractions beyond what the assignment needs.
"""
from __future__ import annotations
import logging
import os
import yaml

logger = logging.getLogger("protoflow.routing")

_ROUTING_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "routing.yaml")
_config: dict = {}


def _load() -> dict:
    global _config
    if _config:
        return _config
    path = os.path.abspath(_ROUTING_PATH)
    try:
        with open(path, encoding="utf-8") as f:
            _config = yaml.safe_load(f) or {}
        logger.info("[routing] Loaded routing config from %s", path)
        stages = _config.get("stages", {})
        for stage, cfg in stages.items():
            logger.info("[routing]   %-25s primary=%-45s fallback=%s",
                        stage, cfg.get("primary", "?"), cfg.get("fallback", "?"))
    except Exception as e:
        logger.error("[routing] Failed to load routing.yaml: %s — using Groq defaults.", e)
        _config = {}
    return _config


_DEFAULTS = {
    "primary": "groq/llama-3.3-70b-versatile",
    "fallback": "openrouter/meta-llama/llama-3.3-70b-instruct",
    "temperature": 0.1,
}

# Stage name aliases: map crew.py stage keys -> routing.yaml stage keys
_STAGE_ALIASES: dict[str, str] = {
    "intent_extraction":   "intent_extraction",
    "architecture_design": "architecture_design",
    "db_schema":           "db_schema",
    "api_schema":          "api_schema",
    "ui_schema":           "ui_schema",
    "auth_schema":         "auth_schema",
    "validation":          "validation",
    "repair":              "repair",
    "workflow_stubs":      "workflow_stubs",
    "runtime_validation":  "runtime_validation",
    "logging":             "logging",
    # agent method name -> stage key
    "intent_extractor":    "intent_extraction",
    "system_architect":    "architecture_design",
    "db_schema_agent":     "db_schema",
    "api_schema_agent":    "api_schema",
    "ui_schema_agent":     "ui_schema",
    "auth_agent":          "auth_schema",
    "validator_agent":     "validation",
    "repair_agent":        "repair",
    "integration_agent":   "workflow_stubs",
    "runtime_validator":   "runtime_validation",
    "progress_logger":     "logging",
}


def model_for_stage(stage: str) -> tuple[str, str, float]:
    """
    Returns (primary_model, fallback_model, temperature) for a pipeline stage.
    Falls back to Groq defaults if stage not found in config.
    """
    cfg = _load()
    stage_key = _STAGE_ALIASES.get(stage, stage)
    stage_cfg = cfg.get("stages", {}).get(stage_key, {})
    primary = stage_cfg.get("primary", _DEFAULTS["primary"])
    fallback = stage_cfg.get("fallback", _DEFAULTS["fallback"])
    temp = float(stage_cfg.get("temperature", _DEFAULTS["temperature"]))
    return primary, fallback, temp


def cost_for_tokens(model: str, input_tokens: int, output_tokens: int) -> float:
    """
    Estimate USD cost for a model call.
    Returns 0.0 if model not in cost_table.
    """
    cfg = _load()
    rates = cfg.get("cost_table", {}).get(model, {})
    if not rates:
        return 0.0
    return (input_tokens * rates.get("input", 0.0) +
            output_tokens * rates.get("output", 0.0))


def routing_summary() -> dict:
    """Return full routing config for visibility in /result and logs."""
    cfg = _load()
    return {
        "stages": cfg.get("stages", {}),
        "providers": list(cfg.get("providers", {}).keys()),
    }