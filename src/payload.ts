import * as utils from './utils';
import * as vscode from 'vscode';

import { ICommand, IMessage } from './interfaces';

export function generatePayload(messages: IMessage[], apiKey: string, functions: any = []) {
    const config = vscode.workspace.getConfiguration('promptrocket');
    let newMessages: IMessage[] = [];

    // Go through messages and combine content and hiddenContext
    messages.forEach((msg) => {
        newMessages.push({
            role: msg.role,
            content: msg.hiddenContext ? msg.hiddenContext + msg.content : msg.content,
            name: msg.role === 'user' ? config.get('userName') : config.get('assistantName'),
        });
    });

    let body: any = {
        model: config.get('useGPT4') ? "gpt-4-0613" : "gpt-3.5-turbo-0613",
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