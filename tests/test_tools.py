"""
Tests for AIUI backend tool system:
  - Tool function unit tests (web_search, fetch_url)
  - Proxy endpoint integration tests (__web_search flag)
  - SSE streaming + tool-call loop validation
"""
import json

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from server.app import (
    _tool_web_search,
    _tool_fetch_url,
    _extract_title,
    execute_tool,
    TOOLS,
)


# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

def _mock_async_client(get_return=None, get_side_effect=None):
    """Build a mock httpx.AsyncClient whose get/post are AsyncMocks."""
    mock_client = AsyncMock()
    if get_return is not None:
        mock_client.get.return_value = get_return
    if get_side_effect is not None:
        mock_client.get.side_effect = get_side_effect
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client


def _mock_response(text="", json_data=None, status_code=200):
    """Build a mock httpx.Response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    if json_data is not None:
        resp.json.return_value = json_data
    return resp


class AsyncIterator:
    """Wrap a list to behave as an async iterator (for aiter_bytes)."""
    def __init__(self, items):
        self._items = iter(items)
    def __aiter__(self):
        return self
    async def __anext__(self):
        try:
            return next(self._items)
        except StopIteration:
            raise StopAsyncIteration


# ═══════════════════════════════════════════════════════════════
# 1. TOOL FUNCTION UNIT TESTS
# ═══════════════════════════════════════════════════════════════

class TestToolWebSearch:
    """_tool_web_search: SearXNG proxy → formatted results."""

    @pytest.mark.asyncio
    async def test_returns_formatted_results(self):
        fake = _mock_response(json_data={
            "results": [
                {"title": "Python 3.13", "url": "https://python.org", "content": "Release notes"},
                {"title": "FastAPI", "url": "https://fastapi.tiangolo.com", "content": "Web framework"},
            ]
        })
        with patch("server.app.httpx.AsyncClient", return_value=_mock_async_client(get_return=fake)):
            result = await _tool_web_search({"query": "python", "count": 5})

        assert "error" not in result
        assert result["query"] == "python"
        assert result["count"] == 2
        assert result["results"][0]["title"] == "Python 3.13"
        assert result["results"][0]["url"] == "https://python.org"
        assert len(result["results"][0]["snippet"]) <= 300

    @pytest.mark.asyncio
    async def test_empty_query_returns_error(self):
        result = await _tool_web_search({"query": ""})
        assert "error" in result

    @pytest.mark.asyncio
    async def test_count_clamped_to_20(self):
        fake = _mock_response(json_data={
            "results": [{"title": f"r{i}", "url": f"https://x.com/{i}", "content": f"c{i}"} for i in range(25)]
        })
        with patch("server.app.httpx.AsyncClient", return_value=_mock_async_client(get_return=fake)):
            result = await _tool_web_search({"query": "test", "count": 30})
        assert result["count"] == 20

    @pytest.mark.asyncio
    async def test_searxng_failure_returns_error(self):
        with patch("server.app.httpx.AsyncClient",
                    return_value=_mock_async_client(get_side_effect=Exception("Connection refused"))):
            result = await _tool_web_search({"query": "test"})
        assert "error" in result
        assert "Connection refused" in result["error"]


class TestToolFetchUrl:
    """_tool_fetch_url: HTTP GET → HTML-stripped text."""

    @pytest.mark.asyncio
    async def test_extracts_text_from_html(self):
        html = """<!DOCTYPE html>
        <html><head><title>Test Page</title></head>
        <body><h1>Hello</h1><p>World paragraph.</p></body></html>"""
        with patch("server.app.httpx.AsyncClient",
                    return_value=_mock_async_client(get_return=_mock_response(text=html))):
            result = await _tool_fetch_url({"url": "https://example.com"})

        assert "error" not in result
        assert result["title"] == "Test Page"
        assert "Hello" in result["content"]
        assert "World paragraph" in result["content"]
        assert result["url"] == "https://example.com"

    @pytest.mark.asyncio
    async def test_strips_script_and_style(self):
        html = """<html><head><title>X</title>
        <style>.x{color:red}</style><script>alert('xss')</script></head>
        <body><p>Safe content</p></body></html>"""
        with patch("server.app.httpx.AsyncClient",
                    return_value=_mock_async_client(get_return=_mock_response(text=html))):
            result = await _tool_fetch_url({"url": "https://example.com"})

        assert "alert" not in result["content"]
        assert "color" not in result["content"]
        assert "Safe content" in result["content"]

    @pytest.mark.asyncio
    async def test_empty_url_returns_error(self):
        result = await _tool_fetch_url({"url": ""})
        assert "error" in result

    @pytest.mark.asyncio
    async def test_prepends_https(self):
        html = "<html><head><title>T</title></head><body>ok</body></html>"
        with patch("server.app.httpx.AsyncClient",
                    return_value=_mock_async_client(get_return=_mock_response(text=html))):
            result = await _tool_fetch_url({"url": "example.com"})
        assert result["url"] == "https://example.com"

    @pytest.mark.asyncio
    async def test_max_length_truncation(self):
        long_body = "<p>" + "x" * 20000 + "</p>"
        html = f"<html><head><title>T</title></head><body>{long_body}</body></html>"
        with patch("server.app.httpx.AsyncClient",
                    return_value=_mock_async_client(get_return=_mock_response(text=html))):
            result = await _tool_fetch_url({"url": "https://example.com", "max_length": 500})

        # Content is truncated + appended with "... (truncated)"
        assert result["content"].endswith("... (truncated)")
        # The actual returned length should be reasonable
        assert result["chars_fetched"] <= 520

    @pytest.mark.asyncio
    async def test_fetch_failure_returns_error(self):
        with patch("server.app.httpx.AsyncClient",
                    return_value=_mock_async_client(get_side_effect=Exception("DNS fail"))):
            result = await _tool_fetch_url({"url": "https://nonexistent.test"})
        assert "error" in result


class TestExtractTitle:
    def test_basic(self):
        assert _extract_title("<html><title>Hello</title></html>") == "Hello"

    def test_multiline(self):
        html = "<html>\n<title>\n  My Page  \n</title>\n</html>"
        assert _extract_title(html) == "My Page"

    def test_missing(self):
        assert _extract_title("<html>no title</html>") == ""


class TestExecuteTool:
    """execute_tool dispatcher — routes to the right handler."""

    @pytest.mark.asyncio
    async def test_unknown_tool(self):
        result = await execute_tool("nonexistent_tool", {})
        assert "error" in result
        assert "Unknown" in result["error"]

    @pytest.mark.asyncio
    async def test_web_search_dispatches(self):
        with patch("server.app._tool_web_search", new_callable=AsyncMock) as mock:
            mock.return_value = {"query": "x", "results": [], "count": 0}
            result = await execute_tool("web_search", {"query": "x"})
            mock.assert_called_once_with({"query": "x"})
            assert result["count"] == 0

    @pytest.mark.asyncio
    async def test_fetch_url_dispatches(self):
        with patch("server.app._tool_fetch_url", new_callable=AsyncMock) as mock:
            mock.return_value = {"url": "https://x.com", "content": "hi", "chars_fetched": 2}
            result = await execute_tool("fetch_url", {"url": "https://x.com"})
            mock.assert_called_once_with({"url": "https://x.com"})
            assert result["content"] == "hi"


# ═══════════════════════════════════════════════════════════════
# 2. PROXY ENDPOINT INTEGRATION TESTS
# ═══════════════════════════════════════════════════════════════

def _make_llm_ok(content="Hello!", tool_calls=None, finish_reason="stop"):
    """LLM response: direct text (no tool call)."""
    msg = {"role": "assistant", "content": content}
    if tool_calls:
        msg["tool_calls"] = tool_calls
        msg["content"] = None
    return _mock_response(
        status_code=200,
        json_data={"id": "x", "choices": [{"index": 0, "message": msg, "finish_reason": finish_reason}]},
    )


def _make_tool_call(call_id, name, args_dict):
    """Build a tool_calls entry for LLM response."""
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args_dict)}}


class TestProxyWithoutTools:
    """__web_search=False → simple passthrough stream (no tool loop)."""

    def _make_stream_mock(self, chunks):
        """Build a mock client whose .stream() returns an async ctx manager yielding chunks."""
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        # resp must be MagicMock so resp.aiter_bytes() returns a sync value (our AsyncIterator)
        mock_stream_resp = MagicMock()
        mock_stream_resp.aiter_bytes.return_value = AsyncIterator(chunks)
        mock_stream_ctx = MagicMock()
        mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_stream_resp)
        mock_stream_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_client.stream.return_value = mock_stream_ctx
        return mock_client

    @pytest.mark.asyncio
    async def test_no_tools_passthrough(self, client):
        fake_chunks = [
            b'data: {"id":"x","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant","content":"Hi"},"finish_reason":null}]}\n\n',
            b'data: {"id":"x","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
            b'data: [DONE]\n\n',
        ]
        with patch("server.app.httpx.AsyncClient", return_value=self._make_stream_mock(fake_chunks)):
            resp = await client.post("/api/chat/completions", json={
                "__base_url": "https://fake.test/v1",
                "__api_key": "k",
                "__web_search": False,
                "model": "test-model",
                "messages": [{"role": "user", "content": "hi"}],
                "stream": True,
            })

        assert resp.status_code == 200
        assert "data:" in resp.text


class TestProxyWithWebSearch:
    """__web_search=True → tool loop engaged."""

    @pytest.mark.asyncio
    async def test_tools_included_in_llm_request(self, client):
        """Verify the LLM receives the tools definition when web search is on."""
        captured = {}

        async def capture_post(url, json=None, **kw):
            captured.update(json or {})
            return _make_llm_ok("No tools needed")

        mock_client = AsyncMock()
        mock_client.post = capture_post
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("server.app.httpx.AsyncClient", return_value=mock_client):
            resp = await client.post("/api/chat/completions", json={
                "__base_url": "https://fake.test/v1",
                "__api_key": "k",
                "__web_search": True,
                "model": "test-model",
                "messages": [{"role": "user", "content": "hi"}],
                "stream": True,
            })

        assert resp.status_code == 200
        assert captured["tools"] == TOOLS
        assert captured["tool_choice"] == "auto"

    @pytest.mark.asyncio
    async def test_tools_not_sent_when_off(self, client):
        """When __web_search=False, the simple_stream path runs (no tools)."""
        fake_chunks = [
            b'data: {"id":"x","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
            b'data: {"id":"x","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
            b'data: [DONE]\n\n',
        ]

        mock_client = MagicMock()  # MagicMock so .stream() isn't a coroutine
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_stream_resp = MagicMock()
        mock_stream_resp.aiter_bytes.return_value = AsyncIterator(fake_chunks)
        mock_stream_ctx = MagicMock()
        mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_stream_resp)
        mock_stream_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_client.stream.return_value = mock_stream_ctx

        with patch("server.app.httpx.AsyncClient", return_value=mock_client):
            resp = await client.post("/api/chat/completions", json={
                "__base_url": "https://fake.test/v1",
                "__api_key": "k",
                "__web_search": False,
                "model": "test-model",
                "messages": [{"role": "user", "content": "hi"}],
                "stream": True,
            })

        assert resp.status_code == 200
        mock_client.post.assert_not_called()

    @pytest.mark.asyncio
    async def test_defaults_to_no_tools(self, client):
        """When __web_search is absent, same as False."""
        fake_chunks = [
            b'data: {"id":"x","object":"chat.completion.chunk","choices":[{"delta":{"content":"X"},"finish_reason":null}]}\n\n',
            b'data: {"id":"x","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
            b'data: [DONE]\n\n',
        ]

        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_stream_resp = MagicMock()
        mock_stream_resp.aiter_bytes.return_value = AsyncIterator(fake_chunks)
        mock_stream_ctx = MagicMock()
        mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_stream_resp)
        mock_stream_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_client.stream.return_value = mock_stream_ctx

        with patch("server.app.httpx.AsyncClient", return_value=mock_client):
            resp = await client.post("/api/chat/completions", json={
                "__base_url": "https://fake.test/v1",
                "__api_key": "k",
                "model": "test-model",
                "messages": [{"role": "user", "content": "hi"}],
                "stream": True,
            })

        assert resp.status_code == 200
        mock_client.post.assert_not_called()


class TestToolCallLoop:
    """Full tool-call loop: LLM asks for tool → executed → re-sent."""

    @pytest.mark.asyncio
    async def test_web_search_tool_loop(self, client):
        search_results = {"query": "python", "results": [
            {"title": "Python", "url": "https://python.org", "snippet": "Language"}
        ], "count": 1}

        call_count = 0
        captured_msgs = []

        async def fake_post(url, json=None, **kw):
            nonlocal call_count
            call_count += 1
            if json:
                captured_msgs.append(json.get("messages", []))
            if call_count == 1:
                return _make_llm_ok(
                    tool_calls=[_make_tool_call("call_1", "web_search", {"query": "python"})],
                    finish_reason="tool_calls"
                )
            return _make_llm_ok("Python is a language.")

        mock_client = AsyncMock()
        mock_client.post = fake_post
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("server.app.httpx.AsyncClient", return_value=mock_client), \
             patch("server.app._tool_web_search", new_callable=AsyncMock, return_value=search_results) as mock_search:
            resp = await client.post("/api/chat/completions", json={
                "__base_url": "https://fake.test/v1",
                "__api_key": "k",
                "__web_search": True,
                "model": "test-model",
                "messages": [{"role": "user", "content": "search for python"}],
                "stream": True,
            })

        assert resp.status_code == 200
        mock_search.assert_called_once_with({"query": "python"})
        assert call_count == 2
        # Second call includes: user + assistant(tool_calls) + tool(result)
        assert len(captured_msgs[1]) >= 3

    @pytest.mark.asyncio
    async def test_fetch_url_tool_loop(self, client):
        fetch_result = {"url": "https://example.com", "title": "Example",
                        "content": "Example content", "chars_fetched": 16}

        call_count = 0

        async def fake_post(url, json=None, **kw):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _make_llm_ok(
                    tool_calls=[_make_tool_call("call_1", "fetch_url", {"url": "https://example.com"})],
                    finish_reason="tool_calls"
                )
            return _make_llm_ok("Fetched: Example content")

        mock_client = AsyncMock()
        mock_client.post = fake_post
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("server.app.httpx.AsyncClient", return_value=mock_client), \
             patch("server.app._tool_fetch_url", new_callable=AsyncMock, return_value=fetch_result) as mock_fetch:
            resp = await client.post("/api/chat/completions", json={
                "__base_url": "https://fake.test/v1",
                "__api_key": "k",
                "__web_search": True,
                "model": "test-model",
                "messages": [{"role": "user", "content": "read example.com"}],
                "stream": True,
            })

        assert resp.status_code == 200
        mock_fetch.assert_called_once_with({"url": "https://example.com"})
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_sse_format_on_tool_response(self, client):
        search_results = {"query": "test", "results": [], "count": 0}

        call_count = 0

        async def fake_post(url, json=None, **kw):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _make_llm_ok(
                    tool_calls=[_make_tool_call("c1", "web_search", {"query": "test"})],
                    finish_reason="tool_calls"
                )
            return _make_llm_ok("Done")

        mock_client = AsyncMock()
        mock_client.post = fake_post
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("server.app.httpx.AsyncClient", return_value=mock_client), \
             patch("server.app._tool_web_search", new_callable=AsyncMock, return_value=search_results):
            resp = await client.post("/api/chat/completions", json={
                "__base_url": "https://fake.test/v1",
                "__api_key": "k",
                "__web_search": True,
                "model": "test-model",
                "messages": [{"role": "user", "content": "search test"}],
                "stream": True,
            })

        body = resp.text
        assert "event: tool_status" in body
        assert "tool_start" in body
        assert "tool_result" in body
        assert "data: [DONE]" in body

    @pytest.mark.asyncio
    async def test_multiple_tool_calls_in_one_round(self, client):
        call_count = 0
        results_sequence = []

        async def fake_post(url, json=None, **kw):
            nonlocal call_count
            call_count += 1
            if json:
                results_sequence.append(json.get("messages", []))
            if call_count == 1:
                return _make_llm_ok(
                    tool_calls=[
                        _make_tool_call("call_1", "web_search", {"query": "a"}),
                        _make_tool_call("call_2", "web_search", {"query": "b"}),
                    ],
                    finish_reason="tool_calls"
                )
            return _make_llm_ok("Combined results")

        search_results = {"query": "x", "results": [], "count": 0}
        mock_client = AsyncMock()
        mock_client.post = fake_post
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("server.app.httpx.AsyncClient", return_value=mock_client), \
             patch("server.app._tool_web_search", new_callable=AsyncMock, return_value=search_results) as mock_search:
            resp = await client.post("/api/chat/completions", json={
                "__base_url": "https://fake.test/v1",
                "__api_key": "k",
                "__web_search": True,
                "model": "test-model",
                "messages": [{"role": "user", "content": "search a and b"}],
                "stream": True,
            })

        assert resp.status_code == 200
        assert mock_search.call_count == 2
        # Second round: user + assistant(tool_calls) + tool(result) + tool(result) = 4
        assert len(results_sequence[1]) == 4


class TestToolDefinitionSchema:
    """Validate the TOOLS array has correct OpenAI function-calling schema."""

    def test_has_three_tools(self):
        assert len(TOOLS) == 3

    def test_tool_names(self):
        names = [t["function"]["name"] for t in TOOLS]
        assert "web_search" in names
        assert "fetch_url" in names
        assert "read_file" in names

    def test_web_search_schema(self):
        ws = next(t for t in TOOLS if t["function"]["name"] == "web_search")
        params = ws["function"]["parameters"]
        assert params["type"] == "object"
        assert "query" in params["properties"]
        assert params["required"] == ["query"]

    def test_fetch_url_schema(self):
        fu = next(t for t in TOOLS if t["function"]["name"] == "fetch_url")
        params = fu["function"]["parameters"]
        assert params["type"] == "object"
        assert "url" in params["properties"]
        assert params["required"] == ["url"]


# ═══════════════════════════════════════════════════════════════
# 3. SSE STREAM PARSING VALIDATION
# ═══════════════════════════════════════════════════════════════

class TestSSEStreamFormat:
    """Verify the SSE chunks are valid JSON and properly formatted."""

    @pytest.mark.asyncio
    async def test_final_response_chunks_valid_json(self, client):
        async def fake_post(url, json=None, **kw):
            return _make_llm_ok("Hello world")

        mock_client = AsyncMock()
        mock_client.post = fake_post
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("server.app.httpx.AsyncClient", return_value=mock_client):
            resp = await client.post("/api/chat/completions", json={
                "__base_url": "https://fake.test/v1",
                "__api_key": "k",
                "__web_search": True,
                "model": "test-model",
                "messages": [{"role": "user", "content": "hi"}],
                "stream": True,
            })

        body = resp.text
        chunks = []
        for line in body.split("\n"):
            if line.startswith("data: ") and line != "data: [DONE]":
                chunks.append(json.loads(line[6:]))

        assert len(chunks) > 0
        for chunk in chunks:
            assert "choices" in chunk
            assert chunk["object"] == "chat.completion.chunk"

        # Last chunk = finish_reason: "stop"
        last = chunks[-1]
        assert last["choices"][0]["finish_reason"] == "stop"
        assert last["choices"][0]["delta"] == {}

        # Content chunks should have "Hello world" spread across them
        all_content = "".join(
            c["choices"][0]["delta"].get("content", "")
            for c in chunks if c["choices"][0]["delta"].get("content")
        )
        assert "Hello world" in all_content

    @pytest.mark.asyncio
    async def test_tool_status_events_valid_json(self, client):
        search_results = {"query": "x", "results": [], "count": 0}

        call_count = 0

        async def fake_post(url, json=None, **kw):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _make_llm_ok(
                    tool_calls=[_make_tool_call("c1", "web_search", {"query": "x"})],
                    finish_reason="tool_calls"
                )
            return _make_llm_ok("Done")

        mock_client = AsyncMock()
        mock_client.post = fake_post
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("server.app.httpx.AsyncClient", return_value=mock_client), \
             patch("server.app._tool_web_search", new_callable=AsyncMock, return_value=search_results):
            resp = await client.post("/api/chat/completions", json={
                "__base_url": "https://fake.test/v1",
                "__api_key": "k",
                "__web_search": True,
                "model": "test-model",
                "messages": [{"role": "user", "content": "x"}],
                "stream": True,
            })

        # Parse tool_status events from the SSE body
        tool_events = []
        lines = resp.text.split("\n")
        i = 0
        while i < len(lines):
            line = lines[i]
            if line.startswith("event: tool_status"):
                # Next data line has the payload
                i += 1
                while i < len(lines) and not lines[i].startswith("data: "):
                    i += 1
                if i < len(lines):
                    payload = json.loads(lines[i][6:])
                    tool_events.append(payload)
            i += 1

        assert len(tool_events) == 2
        assert tool_events[0]["type"] == "tool_start"
        assert tool_events[0]["tool"] == "web_search"
        assert tool_events[1]["type"] == "tool_result"
        assert tool_events[1]["tool"] == "web_search"
