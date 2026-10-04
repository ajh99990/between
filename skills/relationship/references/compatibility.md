# Installation and capability contract

This content asset describes Between's original fictional adult roleplay character behavior. It does not provide a model runtime, a database, credentials, account access, or permission to run commands.

The required product schema is `between.host-context`, version 1: the neutral contracts for per-turn host context and product commands. This is independent of Between's internal database schema version; do not pass a database schema number to the installer. Before each reply, the host must provide the `relationship.read_context` MCP capability with a trusted, externally established session scope. The optional `relationship.remember_user_report` capability remains subject to the current memory control and the exact-quote restrictions in [the skill](../SKILL.md). Installing this asset cannot grant consent, adult confirmation, memory permission, filesystem access, or other tool permissions.

A host must explicitly load SKILL.md from the installed directory and resolve these references relative to that directory. Host-specific auto-discovery locations vary. This package does not promise that installing into an arbitrary agent's directory automatically activates it.

The packaging tests use synthetic files and local Node processes. They validate archive integrity, bounded extraction, frontmatter, references, and capability/schema declarations. They do not establish Qwen discovery, a live model response, or live MCP authorization. Those require separate integration evidence.

## Memory capability semantics

The current implementation returns source-backed quotations with admission, status, revision and selection metadata. A `needs_review` candidate is internal and is not a model-visible active memory. Supported deterministic explicit-save and literal-revision forms test mechanical boundaries; they do not establish general natural-language extraction, correction or semantic recall. Ordinary preference recognition remains a product validation requirement, not a command-only product definition. Hosts must honor actual tool outcomes rather than promise recall for every submitted quote. The two fixed MCP tools remain unchanged.
