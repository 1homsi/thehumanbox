from __future__ import annotations

import asyncio
from collections.abc import Iterable

from . import Backend


class RequestManager:
    def __init__(
        self,
        backend: Backend,
        concurrency: int = 4,
        max_tokens: int = 256,
        temperature: float = 0.2,
    ) -> None:
        if concurrency < 1:
            raise ValueError("concurrency must be >= 1")
        self.backend = backend
        self.concurrency = concurrency
        self.max_tokens = max_tokens
        self.temperature = temperature

    async def _one(self, semaphore: asyncio.Semaphore, prompt: str) -> str:
        async with semaphore:
            return await asyncio.to_thread(
                self.backend.complete,
                prompt,
                self.max_tokens,
                self.temperature,
                None,
            )

    async def amap(self, prompts: Iterable[str]) -> list[str]:
        prompt_list = list(prompts)
        semaphore = asyncio.Semaphore(self.concurrency)
        tasks = [self._one(semaphore, prompt) for prompt in prompt_list]
        return await asyncio.gather(*tasks)

    def map(self, prompts: Iterable[str]) -> list[str]:
        prompt_list = list(prompts)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop and loop.is_running():
            raise RuntimeError("RequestManager.map called inside running loop; use amap")
        return asyncio.run(self.amap(prompt_list))
