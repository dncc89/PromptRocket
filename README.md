# PromptRocket (Experimental)

![Intro](https://i.imgur.com/ekNiaey.gif "Intro")

PromptRocket is an experimental autopilot extension for VSCode leveraging the power of OpenAI's latest function call API. It's not just about having a chat panel in your editor, but also letting it drive VSCode autonomously to reach given targets. Discover more details and updates on the [PromptRocket GitHub repository](https://github.com/dncc89/PromptRocket).

## What distinguishes it from other AI tools?
PromptRocket operates based on some core philosophies.

1. **Autonomous agent**

Using OpenAI's recent function call update, PromptRocket can interact smoothly with VSCode. PromptRocket is now empowered to make recursive action decisions to accomplish the task at hand. Functions currently tackled include context retrieval from the current file, project-wide file list, symbols, and diagnostics retrieval, direct output to the editor, and self-command execution in VSCode. 

🚨 Caution: It might mess up your code or the entire project. Use responsibly.

2. **Fully customizable model and prompts**

Prompts can be fully customized with PromptRocket. Modification extends from the system message to the use of prompt engineering techniques, like custom system messages, step-by-step thinking, and few-shot prompts. All are designed to extract the most effective response from GPT models.

3. **Retains chat history while monitoring text selections**

PromptRocket remembers the chat history, your text selections, and their context. This extension's primary purpose is to enhance brainstorming by incorporating ChatGPT's conversation format into VSCode.

4. **Preserves a minimalistic and neat UI to prevent visual disruption**

No flashy distractions on the panel, that's a promise.

## Abilities

Here are the current functionalities of PromptRocket that interface with VSCode:

- **Get context**: Reads the context around your cursor and selected text.

- **Get project files**: Lists all project files, except those ignored by git.

- **Get symbols**: Retrieves symbols from a file.

- **Get diagnostics**: Decodes the diagnostics for the code. Often muddles AI semantic errors and syntax errors.

- **Search file**: With GPT-3.5-Turbo-16k, it feeds a full file into another agent to find a related text or code block in any file within the project.

- **Send text**: Injects text directly into the editor.

- **Find and select text**: Searches for text, choose the nearest candidate to the cursor if multiple are present.

- **Run command**: Executes a VSCode command. Relying on ChatGPT's intelligence, this function may behave distinctively in newer versions of VSCode.

# How to Use
You can use PromptRocket in two ways: chat mode and command mode.

## Customizable Chat Mode 
Chat mode allows you to initiate a blank chat or use a custom template. Some templates might require extra context for optimised operations. The intelligent text recognition of PromptRocket ensures precise responses and complete context comprehension. It can efficiently track your focus across different files or code sections, offering deeper insights.

- **New Chat** - Ignites a new chat session, devoid of any templates.
- **Open Chat Template** - Initiates a chat employing a customized template.

## Message Shortcuts 
For repeating tasks like writing code comments, providing code snippets, etc., message shortcuts allow you to type less. Salient features like *Insert into editor* can be combined with commands to direct the result into your editor.

- **Open Message Shortcut** - Opens a list of message shortcuts. 
Shortcut is **ctrl(cmd) + shift + ;**.

## Extra Functions
A couple of additional features are also included for enhanced user experience.

### Commands

- **Insert Last Codeblock into Editor** - Automatically inputs the last chat's codeblock into your editor.
- **Send a Message to Chat** - Serves as a convenient shortcut for sending chat messages. With **ctrl(cmd) + shift + '**, no need for mouse usage!

### General

- **Copy or Insert Text into Editor** - Permits the selection of any chat text followed by a group of buttons to clone text to the clipboard or insert it into the editor.

# Prompt Template Examples

In PromptRocket, you can design various command templates and employ Few-Shot Prompts through example conversations. While the default prompts for coding are provided by PromptRocket, you can create your own for general writing tasks.

Here's a basic example:
```json
{
    "name": "Identify Issues",
    "argument": false,
    "prompts": [
    {
        "role": "system",
        "content": "You are a powerful AI programming assistant well-versed in debugging code across various programming languages. Identify issues with the provided code and offer solutions."
    },
    {
        "role": "user",
        "content": "Here's my code written in {{language}}:\\n```{{context_before}}{{selected_text}}{{context_after}}```"
    },
    {
        "role": "user",
        "content": "Please identify any issues with this code and suggest how to fix them."
    }
    ]
}
```

This is a sample few-shot prompt, it involves giving the AI a few examples of the desired responses, and bolstering it with positive feedback. This tends to keep GPT-3.5's responses on track effectively.

```json
{
    "name": "Write a Comment",
    "argument": false,
    "prompts": [
    {
        "role": "system",
        "content": "You are the world's most powerful programming assistant, adept in all programming languages & algorithms. Return a descriptive comment string for the given code."
    },
    {
        "role": "user",
        "content": "```javascript console.log('Hello World!');```"
    },
    {
        "role": "assistant",
        "content": "// Write 'Hello World!' to the console"
    },
    {
        "role": "user",
        "content": "That was spot on! Here's another one: ```python def generate_fibonacci(n): if n <= 1: return n else: return(generate_fibonacci(n-1) + generate_fibonacci(n-2))```"
    },
    {
        "role": "assistant",
        "content": "# Generates the nth Fibonacci number"
    },
    {
        "role": "user",
        "content": "That was spot on! Here's one more: \\n```{{language}} {{context_after}}```"
    }
    ]
}

Messages utilize handlebar templates allowing you to include specifics from the editor, such as the context surrounding the cursor, selected text, and the current language. Here is the full list of tokens:

{{language}} - Current file's language setting
{{argument}} - Additional prompting for the template
{{context_before}} - Context before the cursor position or selected text
{{context_after}} - Context after the cursor position or selected text
{{selected_text}} - Currently selected text