# PromptRocket

![Alt Text Here](public/intro.gif)

PromptRocket is a AI-powered extension for VSCode that effortlessly brings contextual understanding to your side panel. By intelligently analyzing your text selection, it grasps the context and provides relevant suggestions, enhancing your coding experience. Seamlessly integrate PromptRocket to your workflow, and watch your productivity soar through the power of AI-driven insights.
Check out the [PromptRocket GitHub repository](https://github.com/SkateparkCoder/PromptRocket) for more details and updates.

## What's the difference?
I had a hard time finding the perfect AI assistant, as there were many options but none catered to my needs for convenience and customization. Though GitHub's Copilot Chat is a top choice, it uses GPT-3.5 and Codex, which aren't the best performers. So, I decided to build my own custom AI assistant that fits my specific needs.

Here are some core principles of PromptRocket:

1. **It should remember chat history while keeping track of text selections.**

PromptRocket tracks chat history and recognizes your text selections, as well as the context surrounding them. The main purpose of this extension is to boost brainstorming by integrating ChatGPT's conversational format into VSCode.

2. **Maintain a simple and tidy UI that doesn't disrupt visuals.**

I promise there won't be any flashy elements in the panel.

3. **Ensure full customization of the model and prompts.**

This is primarily designed for use with GPT-4, incorporating prompt engineering techniques such as custom system messages, step-by-step thinking, and few-shot prompts.

# How to Use
PromptRocket provides two ways of use, chat mode and command mode.

## Customizable Chat Mode 
Realizing the importance of convenience and customization, our chat mode lets you start a blank chat or use a custom template. Some templates might need extra context for better functionality. PromptRocket's smart text recognition guarantees accurate responses and full context understanding. Its ability to smoothly follow your focus across multiple files or code sections gives you a deeper insight.

- **New Chat** - Launches a new, empty chat free of templates.
- **Open Chat Template** - Begins a chat utilizing a personalized template.
- **Send a Message to Chat** - Acts as a handy shortcut for sending messages to the chat. 
Just press **ctrl(cmd) + shift + '**!

## Simplified Command Mode
Catering to your need for a streamlined experience, our command mode operates directly within the editor. It's perfect for uncomplicated tasks, such as generating code snippets or incorporating comments. GPT-4 compatibility makes it a recommended choice.

- **Run Editor Command** - Executes a command inside the editor, specifically designed for template mode. 
Shortcut is **ctrl(cmd) + shift + ;**.

# Prompt Templates
In PromptRocket, you can create various command templates and utilize Few-Shot Prompts by incorporating example conversations. While PromptRocket supplies default prompts for coding, you can also craft your own templates for general writing tasks.

Here's one of the basic examples.
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
Messages use the handlebar template format, enabling you to include editor information such as the context surrounding the cursor, selected text, and the current language.
Here's the complete list of tokens:
- {{language}} - File's language setting
- {{argument}} - Additional prompting for the template
- {{context_before}} - Context before the cursor position or selected text
- {{context_after}} - Context after the cursor position or selected text
- {{selected_text}} - Currently selected text