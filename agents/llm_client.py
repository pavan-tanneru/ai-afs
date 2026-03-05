"""
Shared LangChain LLM client and prompt loader.
All LLM calls go through here with retry logic and JSON parsing.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Type

import yaml
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    before_sleep_log,
)

from core.config import get_settings
from core.logging_config import get_logger

logger = get_logger(__name__)
settings = get_settings()

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _build_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.MODEL_NAME,
        openai_api_key=settings.XAI_API_KEY,
        openai_api_base=settings.XAI_BASE_URL,
        temperature=0,
        max_retries=0,  # retries handled by tenacity below
        model_kwargs={"response_format": {"type": "json_object"}},
    )


def load_prompt(name: str) -> dict[str, str]:
    """Load a prompt template from the prompts directory."""
    path = PROMPTS_DIR / f"{name}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_chain(prompt_name: str, pydantic_model: Type[BaseModel]):
    """Build a LangChain LCEL chain: prompt | llm | json_parser."""
    templates = load_prompt(prompt_name)
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", templates["system_template"]),
            ("human", templates["human_template"]),
        ]
    )
    llm = _build_llm()
    parser = JsonOutputParser(pydantic_object=pydantic_model)
    return prompt | llm | parser


async def invoke_with_retry(chain, inputs: dict[str, Any]) -> dict[str, Any]:
    """Invoke a LangChain chain with exponential backoff retries."""

    @retry(
        stop=stop_after_attempt(settings.MAX_LLM_RETRIES),
        wait=wait_exponential(
            min=settings.LLM_RETRY_MIN_WAIT,
            max=settings.LLM_RETRY_MAX_WAIT,
        ),
        retry=retry_if_exception_type(Exception),
        reraise=True,
    )
    async def _invoke():
        return await chain.ainvoke(inputs)

    return await _invoke()
