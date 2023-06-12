import * as utils from './utils';
import * as vscode from 'vscode';

import { ICommand, IMessage } from './interfaces';

export function generatePayload(messages: IMessage[], apiKey: string) {
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

    const payload = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: config.get('useGPT4') ? "gpt-4" : "gpt-3.5-turbo",
            temperature: config.get('temperature'),
            top_p: config.get('top_p'),
            frequency_penalty: config.get('frequency_penalty'),
            messages: newMessages,
            stream: true,
        }),
    };

    return payload;
}