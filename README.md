# Proofreader Plugin

This plugin provides automated proofreading, grammar checking, and "out-of-character" dialogue detection for the Sequential Comic Server.

## Dependencies & Requirements

* **Local LLM Engine Plugin:** This plugin relies heavily on the `localLlmEngine` plugin being installed and enabled. It does not spawn an AI process itself; instead, it queries `/api/plugins/localLlmEngine/generate`.
* **Character Lab Data:** To detect out-of-character dialogue, this plugin fetches the `dialogueStylePrompt` field from your Character bibles in the database and injects them into the LLM system prompt.

## How it works

When triggered, the Proofreader:
1. Grabs the last 3 pages of your comic to establish scene context.
2. Extracts all characters present in the scene.
3. Builds a dynamic ChatML prompt requesting a critique of the text.
4. Returns the AI's analysis for you to review before publishing.
