## Task

You are customizing the knowledge base for this project. Write the file
`.scaffold/knowledge/{{name}}.md` with valid YAML frontmatter and a markdown body
tailored to this project's context.

The file must start with:
```yaml
---
name: {{name}}
description: <one-line description reflecting this project's context>
topics: [<comma-separated topic keywords>]
---
```
Followed by the full knowledge body as markdown.

## Global Knowledge Entry (seed)

{{globalBody}}

{{#hasLocalOverride}}
## Existing Local Override (update mode)

The following is the current project-specific version of this entry. Preserve what
is still accurate, revise what the Focus instructions change, and add what is missing.

{{localOverrideContent}}
{{/hasLocalOverride}}

## Project Context

Methodology: {{methodology}}

{{#hasArtifacts}}
Relevant project artifacts:

{{artifacts}}
{{/hasArtifacts}}

{{#hasFocus}}
## Focus

{{focus}}

{{/hasFocus}}
## Output Instructions

- Write the COMPLETE file — frontmatter + full body. Do not summarize or skip sections.
- Tailor the content to this project's tech stack, conventions, and context.
- In create mode: use the Global Knowledge Entry as the structural seed; adapt every
  section to the project rather than keeping generic guidance verbatim.
- In update mode: diff against the Existing Local Override; preserve project-specific
  decisions; revise based on Focus; add anything the Focus requires.
- Output only the file contents. No commentary before or after.
- Output path: `.scaffold/knowledge/{{name}}.md`
