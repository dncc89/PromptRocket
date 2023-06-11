import * as utils from './utils';
import * as vscode from 'vscode';

import { ICommand, IMessage } from './interfaces';

export function generatePayload(messages: IMessage[], apiKey: string) {
    const config = vscode.workspace.getConfiguration('promptrocket');
    const payload = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: config.get('useGPT4') ? "gpt-4" : "gpt-3.5-turbo",
            messages: messages,
            stream: true,
        }),
    };

    return payload;
}