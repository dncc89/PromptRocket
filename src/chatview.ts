import * as message from './message';
import * as payload from './payload';
import * as utils from './utils';
import * as vscode from 'vscode';

import { IMessage } from './interfaces';
import { InputCommand } from './inputCommand';
import { config } from 'process';
import { getHtmlForWebview } from './html';

export class ChatView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'promptrocket.view';
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;
    private _apiKey: string;
    private _messages: IMessage[] = [];
    private _textSelection: string = '';
    private _initialMessageLength: number = 0;
    private _config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("promptrocket");
    private _globalState: vscode.Memento;
    private _cancelToken = false;
    private _firstLaunch = true;
    private _inputCommand?: InputCommand;

    constructor(context: vscode.ExtensionContext, apiKey: string) {
        this._view = undefined;
        this._inputCommand = undefined;
        this._context = context;
        this._apiKey = apiKey;
        this._globalState = context.globalState;
        this._loadMessages();
    }

    startNewChat(messages: IMessage[], argument: string) {
        this._resetWebview();
        this._messages = messages;
        this._cancelToken = true;
        this._saveMessages();

        if (this._messages.length === 0) {
            // Add default system message if there are no messages
            const sysMsg = this._config.get("defaultSystemMessage", []) as unknown as string;
            const defaultMessage: IMessage = {
                role: 'system',
                content: sysMsg
            };
            this._messages.push(defaultMessage);
            this._initialMessageLength = this._messages.length;
        }
        else {
            // If it starts with messages, it means it's a template. 
            // However on first launch it also loads saved messages, should not be treated as template
            if (this._firstLaunch) {
                this._firstLaunch = false;
                this._initialMessageLength = 0;
            }
            else {
                if (argument) {
                    this.sendUserMessage(argument);
                }
                else {
                    this.sendUserMessage(this._messages[this._messages.length - 1].content || '');
                }
                this._initialMessageLength = this._messages.length;
            }
        }
    }

    insertLastCodeblock() {
        utils.replaceSelectedText(this._globalState.get('codebuffer', ''));
    }

    // Send user message from the extension, so it will be displayed in the chat
    async sendUserMessage(text: string, startCompletion: boolean = true, inputFromWebview: boolean = false) {
        // Show panel
        await vscode.commands.executeCommand('workbench.view.extension.promptrocket-container');

        // Post user message then wait for webview to be ready
        await this._waitForWebviewReady();

        // Branch for input command and regular message
        if (text.startsWith('/')) {
            await new Promise((resolve) => {
                setTimeout(() => {
                    resolve(null);
                }, 500);
            });
            await this._inputCommand?.processInput(text, inputFromWebview);
        }
        else {
            this._postMessage(text, 'user');
            if (startCompletion) {
                await this._returnMessage(text, inputFromWebview);
            }
        }

        if (!inputFromWebview) {
            await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        }
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
        this._inputCommand = new InputCommand(this._context, this._view);

        this.startNewChat(this._messages, '');
        this._view.webview.postMessage({ command: 'setModel', text: this._config.get('model') });

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
                    this.sendUserMessage(message.text, true, true);
                    break;
                case 'copyToClipboard':
                    vscode.env.clipboard.writeText(message.text);
                    break;
                case 'replaceSelectedText':
                    utils.replaceSelectedText(message.text);
                    break;
                case 'updateCodeblockBuffer':
                    this._globalState.update('codebuffer', message.text);
                    break;
                case 'viewInitialized':
                    console.log('view initialized');
                    this._populateWebview();
                    break;
                case 'cancelStreaming':
                    this._cancelToken = true;
                    break;
                case 'changeModel':
                    this._config.update('model', message.text, true);
                    this._postMessage(`Model changed to ${message.text}`, 'system');
                    break;
            }
        });
    }

    private _resetWebview() {
        if (this._view) {
            this._messages = [];
            this._view.webview.html = '';
            this._view.webview.html = getHtmlForWebview(this._context, this._view.webview);
            this._setUsername();
        }
    }

    private _populateWebview() {
        // run through the messages and populate the webview
        // Should ignore first messages less than initialMessageLength
        this._setUsername();
        for (let i = this._initialMessageLength; i < this._messages.length; i++) {
            if (this._messages[i].role !== 'system') {
                this._postMessage(this._messages[i].content || '', this._messages[i].role);
            }
        }
    }

    private async _postMessage(text: string, sender: string = 'user') {
        await this._view?.webview.postMessage({
            command: 'showMessage',
            text: text,
            sender: sender,
            isNewMessage: false,
        });
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
        // console.log(`id: ${id} toRemove: ${this._initialMessageLength}, messagelength: ${this._messages.length}`);
        if (id < this._messages.length) {
            for (let i = this._messages.length; i >= id; i--) {
                this._messages.pop();
            }
        }
    }

    private async _returnMessage(text: string, inputFromWebview: boolean) {
        try {
            // preprocess messages 
            this._messages = message.preprocessMessages(this._messages);
            this._cancelToken = false;

            // If id is empty, it means the user is sending a new message from a template
            // In this case context is handled in preprocessMessages 
            if (text === '') {
                const length = this._messages.length - 1;
                this._postMessage(this._messages[length].content || '', 'user');
            }
            else {
                // grab text selection and compare what's stored in the variable
                const selection = utils.getContext()[1];
                let context = `Context:\`\`\`${selection}\`\`\`\n`;
                if (selection === '' || selection === this._textSelection) {
                    context = '';
                }

                this._textSelection = selection;

                const userMessage: IMessage = {
                    role: 'user',
                    hiddenContext: context,
                    content: text,
                };
                this._messages.push(userMessage);
            }

            const p = payload.generatePayload(this._messages, this._apiKey);
            const stream = await message.streamCompletion(p);

            // Initialize a new message with empty content
            let currentMessage = '';
            this._messages.push({
                role: 'assistant',
                content: currentMessage
            });
            this._saveMessages();

            let i = 0;
            stream.on('data', (chunk) => {
                if (this._cancelToken) {
                    stream.removeAllListeners();
                    return;
                }
                this._view?.webview.postMessage({
                    command: 'chatStreaming',
                    text: chunk,
                    sender: 'assistant',
                    isNewMessage: i === 0
                });
                i++;
                currentMessage += chunk;
                this._messages[this._messages.length - 1].content = currentMessage;
                this._saveMessages();
            });

            stream.on('end', () => {
                this._view?.webview.postMessage({
                    command: 'chatStreaming',
                    isCompletionEnd: true
                });
                // Message is sent from webview, return the focus
                if (inputFromWebview) {
                    this._focusInputBox();
                }
                // Reset the current message for the next message
                currentMessage = '';
            });

            stream.on('error', (error) => {
                console.error(`Error while streaming completion: ${error}`);
            });

        } catch (error) {
            console.error(`Error while sending message: ${error}`);
        }
    }

    // Save message array to globalState
    private _saveMessages() {
        this._globalState.update('messages', this._messages);
    }

    // Load message array from globalState
    private _loadMessages() {
        this._messages = this._globalState.get('messages', []) as IMessage[];
    }

    private _focusInputBox() {
        this._view?.webview.postMessage({
            command: "focusInputBox"
        });
    }
}