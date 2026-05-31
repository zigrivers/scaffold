---
name: mcp-prompt-primitives
description: MCP prompts as user-controlled primitives, prompts/list and prompts/get methods, arguments, message roles, and when to use prompts vs tools
topics: [mcp, prompts, ux, slash-commands, prompt-templates]
volatility: evolving
last-reviewed: null
version-pin: 'MCP spec 2025-06-18'
sources:
  - url: https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
---

Prompts in MCP are structured, reusable message templates that users explicitly select. They are different from tools (model-controlled, automatic) and resources (application-controlled, passive context). Understanding the distinction shapes how you expose server capabilities.

## Summary

Servers declare prompts via `prompts/list`; clients retrieve a populated prompt via `prompts/get` with filled-in arguments. Each prompt returns a `messages` array with `role`/`content` pairs ready to inject into a conversation. Prompts are **user-controlled** — they appear as slash commands or UI-selectable templates. Declare `prompts: { listChanged: true }` if the available prompts can change at runtime. Use prompts when a user needs to explicitly invoke a repeatable interaction pattern; use tools when the LLM should autonomously execute an action.

## Deep Guidance

### Prompts as user-controlled primitives

The defining characteristic of MCP prompts is that they are **user-initiated**, not model-initiated. The host surfaces them as discoverable, selectable commands — typically slash commands in a chat UI, menu items in an IDE, or shortcut buttons in a desktop app. The user explicitly chooses a prompt, fills in any arguments, and the resulting message sequence is injected into the conversation.

This contrasts sharply with tools (which the LLM invokes automatically based on context) and resources (which the host includes in context based on application logic). Prompts are neither automatic nor passive — they are deliberate user actions.

### prompts/list — discovery

`prompts/list` returns available prompt templates. Each entry includes `name`, optional `title` (display name), optional `description`, and an optional `arguments` array:

```json
{
  "prompts": [
    {
      "name": "code_review",
      "title": "Request Code Review",
      "description": "Ask the model to review code for quality, bugs, and improvements",
      "arguments": [
        {
          "name": "code",
          "description": "The source code to review",
          "required": true
        },
        {
          "name": "language",
          "description": "Programming language, e.g. TypeScript",
          "required": false
        }
      ]
    }
  ]
}
```

`prompts/list` supports cursor-based pagination. If the server can add or remove prompts dynamically, declare `prompts: { listChanged: true }` and send `notifications/prompts/list_changed` when the set changes.

### prompts/get — retrieval and argument injection

`prompts/get` takes a `name` and an `arguments` map (matching the declared argument names to concrete values). The server returns a `messages` array — fully formed conversation messages ready to send to an LLM:

```json
{
  "method": "prompts/get",
  "params": {
    "name": "code_review",
    "arguments": {
      "code": "function add(a, b) { return a + b }",
      "language": "JavaScript"
    }
  }
}
```

Response:
```json
{
  "result": {
    "description": "Code review prompt for JavaScript",
    "messages": [
      {
        "role": "user",
        "content": {
          "type": "text",
          "text": "Please review this JavaScript code for quality, potential bugs, and improvements:\n\nfunction add(a, b) { return a + b }"
        }
      }
    ]
  }
}
```

The server does the argument substitution and structures the messages — the client does not template-expand arguments itself. This lets the server implement sophisticated logic: injecting relevant resources, fetching live data to embed in the prompt, or constructing multi-turn conversation starters.

### Message roles and content types

Prompt messages support `role: "user"` and `role: "assistant"`. Use `"user"` for the human turn and `"assistant"` for pre-seeded model responses (useful for few-shot examples or to prime a specific response style).

Content types within messages match tool result content types: `text`, `image`, `audio`, and `resource` (embedded resource). Use embedded resources to include relevant file contents, API data, or database records directly in the prompt without requiring a separate `resources/read` call.

### When to use prompts vs tools vs resources

These three primitives answer different questions:

| Primitive | Controlled by | When to use |
|-----------|--------------|-------------|
| **Prompt** | User (explicit selection) | Repeatable interaction patterns a user deliberately invokes: code review, explain concept, generate commit message |
| **Tool** | LLM (autonomous invocation) | Actions the LLM should take as part of its reasoning: fetch data, write file, call API |
| **Resource** | Application (contextual inclusion) | Background context the LLM should be aware of: current file, open database schema, active configuration |

A prompt for "generate a commit message" is appropriate — the user explicitly decides to invoke this pattern. A tool for "get_current_file" is appropriate — the LLM decides when fetching the current file is relevant to its task. A resource for "current_project_schema" is appropriate — the host automatically includes the schema as background context.

Avoid turning every capability into a prompt. Prompts that should be tools (because the LLM should invoke them automatically) create friction. Prompts that should be resources (because they're background context) waste a user action.

### Argument design

Keep prompt arguments minimal. Each required argument is a burden on the user. Design prompts that work well with few arguments and use the server's access to context (active files, project config, authenticated user state) to fill in the rest.

Use required arguments for inputs the server genuinely cannot infer: the code to review, the ticket ID to reference. Use optional arguments with sensible defaults for refinements: language hint, verbosity level, output format.

Validate all arguments before building the messages. Return a JSON-RPC `-32602` (invalid params) error for missing required arguments or invalid values, with a clear message identifying which argument is problematic and what a valid value looks like.
