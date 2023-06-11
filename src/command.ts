import * as message from './message';
import * as payload from './payload';
import * as vscode from 'vscode';

import { IMessage } from './interfaces';

export class Command {
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

        const p = payload.generatePayload(this._messages, this._apiKey);
        const stream = await message.streamCompletion(p);
        let text = '';

        stream.on('data', (data) => {
            text += data;
            let shortMsg = text.slice(-20);
            const progressMessage = `Thinking: ${shortMsg}`;
            vscode.window.setStatusBarMessage(progressMessage, 1000);
        });

        stream.on('end', () => {
            vscode.window.setStatusBarMessage('');

            editor.edit((editBuilder) => {
                editBuilder.insert(editor.selection.active, text);
            });
        });

        stream.on('error', (error) => {
            console.error(`Error while streaming completion: ${error.message}`);
        });
    }
}


