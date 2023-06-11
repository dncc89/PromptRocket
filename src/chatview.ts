import * as fs from 'fs';
import * as message from './message';
import * as path from 'path';
import * as payload from './payload';
import * as utils from './utils';
import * as vscode from 'vscode';

import { IMessage } from './interfaces';
import { config } from 'process';
import { start } from 'repl';
import { json } from 'stream/consumers';

export class ChatView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'promptrocket.view';
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;
    private _apiKey: string;
    private _messages: IMessage[] = [];
    private _textSelection: string = '';
    private _initialMessageLength: number = 0;
    private _codeblockBuffer: string = '';
    private _config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("promptrocket");
    private _cancelToken = false;

    constructor(context: vscode.ExtensionContext, apiKey: string) {
        this._view = undefined;
        this._context = context;
        this._apiKey = apiKey;
    }

    startNewChat(messages: IMessage[], argument: string) {
        this._resetWebview();
        this._cancelToken = true;
        this._messages = messages;

        if (this._messages.length === 0) {
            // Add default system message if there are no messages
            const sysMsg = this._config.get("defaultSystemMessage", []) as unknown as string;
            const defaultMessage: IMessage = {
                role: 'system',
                content: sysMsg || 'You are a powerful AI programming assistant called PromptRocket.'
            };
            this._messages.push(defaultMessage);
            this._initialMessageLength = this._messages.length;
        }
        else {
            // If it starts with messages, it means it's a template.
            this._initialMessageLength = this._messages.length;
            if (argument) {
                this.sendUserMessage(argument);
            }
            else {
                this.sendUserMessage(this._messages[this._messages.length - 1].content || '');
            }
        }
    }

    // Send user message from the extension, so it will be displayed in the chat
    async sendUserMessage(text: string, isUserMessage: boolean = true, startCompletion: boolean = true, returnFocus: boolean = false) {
        // Show panel
        await vscode.commands.executeCommand('workbench.view.extension.promptrocket-container');

        // Wait for webview to be ready
        await this._waitForWebviewReady();
        await this._view?.webview.postMessage({
            command: 'populateMessage',
            text: text,
            isUserMessage: isUserMessage,
            isNewMessage: false
        });

        if (startCompletion) {
            await this._returnMessage(text);
        }

        if (returnFocus) {
            vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        }
    }

    private _waitForWebviewReady() {
        return new Promise((resolve) => {
            let checkWebviewInterval = setInterval(() => {
                if (this._view) {
                    clearInterval(checkWebviewInterval);
                    resolve(null);
                }
            }, 500);
        });
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        this._view.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };
        this.startNewChat([], '');

        // if there are exisitng messages, send them to the webview
        if (this._messages.length > 0) {
            this._messages.forEach((message) => {
                webviewView.webview.postMessage({ text: message.content, isNewMessage: false });
            });
        }

        webviewView.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'userMessage':
                    this._updateMessageArray(message.id);
                    this._returnMessage(message.text);
                    break;
                case 'copyToClipboard':
                    vscode.env.clipboard.writeText(message.text);
                    break;
                case 'replaceSelectedText':
                    utils.replaceSelectedText(message.text);
                    break;
                case 'updateCodeblockBuffer':
                    this._codeblockBuffer = message.text;
                    break;
                case 'viewInitialized':
                    this._populateWebview();
                    break;
                case 'cancelStreaming':
                    this._cancelToken = true;
                    break;
            }
        });
    }

    insertLastCodeblock() {
        utils.replaceSelectedText(this._codeblockBuffer);
    }

    private _resetWebview() {
        if (this._view) {
            this._messages = [];
            this._view.webview.html = '';
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
            this._setUsername();
        }
    }

    private _populateWebview() {
        // run through the messages and populate the webview
        // Should ignore first messages less than initialMessageLength
        this._setUsername();
        for (let i = this._initialMessageLength; i < this._messages.length; i++) {
            this._view?.webview.postMessage({
                command: 'populateMessage',
                text: this._messages[i].content,
                isUserMessage: this._messages[i].role === 'user',
                isNewMessage: false
            });
        }
    }

    private _setUsername() {
        // Set usernames 
        const config = vscode.workspace.getConfiguration("promptrocket");
        const username = config.get("userName", []);
        const assistantname = config.get("assistantName", []);
        this._view?.webview.postMessage({
            command: "setUserName",
            name: username,
        });
        this._view?.webview.postMessage({
            command: "setAssistantName",
            name: assistantname,
        });
    }

    private _updateMessageArray(id: number) {
        // Remove all messages after the id
        // System message is at 1, should not be removed
        console.log(`id: ${id} toRemove: ${this._initialMessageLength}, messagelength: ${this._messages.length}`);
        if (id < this._messages.length) {
            for (let i = this._messages.length; i >= id; i--) {
                this._messages.pop();
            }
        }
    }

    private async _returnMessage(text: string) {
        try {
            // preprocess messages 
            this._messages = message.preprocessMessages(this._messages);
            this._cancelToken = false;

            // If id is empty, it means the user is sending a new message from a template
            // In this case context is handled in preprocessMessages 
            if (text === '') {
                const length = this._messages.length - 1;
                this._view?.webview.postMessage({
                    command: "chatMessage",
                    text: this._messages[length].content,
                    isUserMessage: true
                });
            }
            else {
                // grab text selection and compare what's stored in the variable
                const selection = utils.getContext()[1];
                let newContent = `Context:\`\`\`${selection}\`\`\`\n ${text}`;

                if (selection === '' || selection === this._textSelection) {
                    newContent = text;
                }

                this._textSelection = selection;

                const userMessage: IMessage = {
                    role: 'user',
                    content: newContent,
                };
                this._messages.push(userMessage);
            }

            const p = payload.generatePayload(this._messages, this._apiKey);
            const stream = await message.streamCompletion(p);

            let currentMessage = '';
            let i = 0;
            stream.on('data', (chunk) => {
                if (this._cancelToken) {
                    stream.removeAllListeners();
                    return;
                }
                this._view?.webview.postMessage({
                    command: "chatMessage",
                    text: chunk,
                    isNewMessage: i === 0
                });
                i++;
                currentMessage += chunk;
            });

            stream.on('end', () => {
                if (this._cancelToken) {
                    stream.removeAllListeners();
                    return;
                }
                this._view?.webview.postMessage({
                    command: "chatMessage",
                    isCompletionEnd: true
                });

                // Add response to the message history
                this._messages.push({
                    role: 'assistant',
                    content: currentMessage
                });
                currentMessage = '';
            });


            stream.on('error', (error) => {
                console.error(`Error while streaming completion: ${error}`);
            });

        } catch (error) {
            console.error(`Error while sending message: ${error}`);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const assistantName = vscode.workspace.getConfiguration("promptrocket").get("assistantName", []);
        const scriptPathOnDisk = vscode.Uri.joinPath(this._context.extensionUri, 'media', 'main.js');
        const cssPathOnDisk = vscode.Uri.joinPath(this._context.extensionUri, 'media', 'main.css');
        const codiconsUri = vscode.Uri.joinPath(this._context.extensionUri, 'media', 'codicon.css');
        const fontawesomeUri = vscode.Uri.joinPath(this._context.extensionUri, 'media', 'fontawesome.css');
        const markedUri = vscode.Uri.joinPath(this._context.extensionUri, 'media', 'marked.min.js');

        const mainScript = webview.asWebviewUri(scriptPathOnDisk);
        const mainStyles = webview.asWebviewUri(cssPathOnDisk);
        const codicons = webview.asWebviewUri(codiconsUri);
        const fontawesome = webview.asWebviewUri(fontawesomeUri);
        const marked = webview.asWebviewUri(markedUri);

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta
                name="viewport"
                content="width=device-width, initial-scale=1.0"
            >
            <link href="${mainStyles}" rel="stylesheet">
            <link href="${codicons}" rel="stylesheet">
            <link href="${fontawesome}" rel="stylesheet">
            <title>Chat Panel</title>
        </head>
        <body>
        <app>
            <script src="${marked}"></script>
            <div id="header-bar">
            </div>
            <div id="output-container">
                <div id="message-list">
                    <div class="assistant-message-wrapper"> 
                        <div class="sender-assistant"><span class="fa-solid fa-user-astronaut margin-right-5"></span><span>${assistantName}</span></div><div class="extension-message">
                        <p>Hello! How can I assist you today? 🚀</p>
                        </div>
                    </div>
                </div>
            </div>

	        <div id="input-container">
                <textarea class="inputbox" id="user-input" rows="1" placeholder="What's on your mind?"></textarea>
                <button class="button-overlap-inputbox" id="send-button">
                    <i class="fa-regular fa-paper-plane"></i>
                </button>
            </div>
        </app>
        <script src="${mainScript}"></script>
        </body>
        </html>`;
    }
}