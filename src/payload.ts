import * as utils from './utils';
import * as vscode from 'vscode';

import { ICommandTemplate, IMessage } from './interfaces';

export async function generatePayload(messages: IMessage[], apiKey: string, functions: any = []) {
    const config = vscode.workspace.getConfiguration('promptrocket');
    let newMessages = await preprocessMessages(messages);

    let body: any = {
        model: config.get('model') || "gpt-3.5-turbo-0613",
        temperature: config.get('temperature') || 0,
        top_p: config.get('top_p') || 1,
        frequency_penalty: config.get('frequency_penalty') || 0,
        messages: newMessages,
        stream: true,
    };

    if (functions.length > 0) {
        body.functions = functions;
        body.function_call = "auto";
    };

    const payload = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    };

    return payload;
}

export async function generateSearchPayload(filename: string, text: string, apiKey: string) {
    const config = vscode.workspace.getConfiguration('promptrocket');
    const context = await utils.readWholeFile(filename);

    const newMessages: IMessage[] = [
        {
            role: "user",
            content: `Context:\n\`\`\`${context}\`\`\`\n\nFind a relavant context block for this request and return it in binary: ${text}`,
        }
    ];

    let body: any = {
        model: "gpt-3.5-turbo-16k-0613",
        temperature: 0,
        messages: newMessages,
        functions: [
            {
                "name": "convert_to_binary",
                "description": "Converts given text to binary",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "The text to convert",
                        },
                    },
                    "required": ["text"],
                },
            },
        ],
    };

    const payload = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    };

    return payload;
}

async function preprocessMessages(messages: IMessage[]) {
    const language = await utils.getLanguageID();
    const context = await utils.getContext() || ['', '', ''];
    let newMessages: IMessage[] = [];

    messages.forEach((msg) => {
        // console.log(msg);
        let role = msg.role || "user";
        let hiddenContext = msg.hiddenContext || "";
        let content = msg.content || "";
        let name = msg.name || "";

        // if name isn ot empty and role is function, skip this
        if (name.length === 0 && role === "function") {
            return;
        }

        content = content.replace(/{{language}}/g, language);
        content = content.replace(/{{context_before}}/g, context[0]);
        content = content.replace(/{{selected_text}}/g, context[1]);
        content = content.replace(/{{context_after}}/g, context[2]);

        const newMessage: IMessage = {
            role: role,
            content: content,
        };
        if (hiddenContext.length > 0) {
            newMessage.content = `Context: \`\`\`${hiddenContext}\`\`\`\n${content}`;
        }
        if (name.length > 0) {
            newMessage.name = name;
        }

        newMessages.push(newMessage);
    });

    return newMessages;
}