import * as message from './message';
import * as payload from './payload';
import * as vscode from 'vscode';

import { IMessage } from './interfaces';

export class EditorCommand {
    private _apiKey: string;
    private _messages: IMessage[] = [];

    constructor(context: vscode.ExtensionContext, apiKey: string) {
        this._apiKey = apiKey;
    }

    async runCommand(messages: IMessage[], argument: string) {
        this._messages = messages;
        this._messages = message.preprocessMessages(this._messages);

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        if (argument) {
            this._messages.push({
                role: 'user',
                content: argument,
            });
        }

        const cmd = [
            {
                "name": "write",
                "description": "Write requested code or text into editor",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "Requested code or text, e.g. print('Hello World!')"
                        },
                    },
                    "required": ["text"],
                },
            }
        ];

        const p = payload.generatePayload(this._messages, this._apiKey, cmd);
        const stream = await message.streamCompletion(p);
        let text = '';

        stream.on('data', (data) => {
            text += data;
            let shortMsg = text.slice(-10);
            const progressMessage = `${shortMsg}`;
            vscode.window.setStatusBarMessage(progressMessage, 1000);
        });

        stream.on('end', () => {
            vscode.window.setStatusBarMessage('');
            const jsonData = JSON.parse(text);
            editor.edit((editBuilder) => {
                editBuilder.insert(editor.selection.active, jsonData.text);
            });
        });

        stream.on('error', (error) => {
            console.error(`Error while streaming completion: ${error.message}`);
        });
    }
}


