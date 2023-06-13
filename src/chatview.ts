import * as message from './message';
import * as payload from './payload';
import * as utils from './utils';
import * as vscode from 'vscode';

import { IMessage } from './interfaces';
import { config } from 'process';

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
    private _globalState: vscode.Memento;
    private _cancelToken = false;
    private _firstLaunch = true;

    constructor(context: vscode.ExtensionContext, apiKey: string) {
        this._view = undefined;
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

    // Send user message from the extension, so it will be displayed in the chat
    async sendUserMessage(text: string, isUserMessage: boolean = true, startCompletion: boolean = true, inputFromWebview: boolean = false) {
        // Show panel
        await vscode.commands.executeCommand('workbench.view.extension.promptrocket-container');

        // Post user message then wait for webview to be ready
        await this._waitForWebviewReady();


        if (text.startsWith('/')) {
            this._postSystemMessage(text, isUserMessage);

            await new Promise((resolve) => {
                setTimeout(() => {
                    resolve(null);
                }, 500);
            });

            await this._inputCommands(text, inputFromWebview);
        }
        else {
            this._postMessage(text, isUserMessage);
            if (startCompletion) {
                await this._returnMessage(text, inputFromWebview);
            }
        }

        if (!inputFromWebview) {
            await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        }
    }

    private async _postMessage(text: string, isUserMessage: boolean = true) {
        await this._view?.webview.postMessage({
            command: 'populateMessage',
            text: text,
            isUserMessage: isUserMessage,
            isNewMessage: false,
            isSystemMessage: false
        });
    }

    private async _postSystemMessage(text: string, isUserMessage: boolean = true) {
        await this._view?.webview.postMessage({
            command: 'populateMessage',
            text: text,
            isUserMessage: isUserMessage,
            isNewMessage: false,
            isSystemMessage: true
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

        this.startNewChat(this._messages, '');
        this._view.webview.postMessage({ command: 'setModel', text: this._config.get('useGPT4') ? 'GPT-4' : 'GPT-3.5-Turbo' });

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
                    this.sendUserMessage(message.text, true, true, true);
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
                    console.log('view initialized');
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
            if (this._messages[i].role !== 'system') {
                this._view?.webview.postMessage({
                    command: 'populateMessage',
                    text: this._messages[i].content,
                    isUserMessage: this._messages[i].role === 'user',
                    isNewMessage: false
                });
            }
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
                this._view?.webview.postMessage({
                    command: "chatMessage",
                    text: this._messages[length].content,
                    isUserMessage: true
                });
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

            let currentMessage = '';
            // Add response to the message history
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
                    command: "chatMessage",
                    text: chunk,
                    isNewMessage: i === 0
                });
                i++;
                currentMessage += chunk;
                this._messages[this._messages.length - 1].content = currentMessage;
                this._saveMessages();
            });

            stream.on('end', () => {
                if (this._cancelToken) {
                    stream.removeAllListeners();
                }
                else {
                    this._view?.webview.postMessage({
                        command: "chatMessage",
                        isCompletionEnd: true
                    });
                }

                // Message is sent from webview
                if (inputFromWebview) {
                    this._focusInputBox();
                }

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
        const userName = vscode.workspace.getConfiguration("promptrocket").get("userName", []);
        const assistantName = vscode.workspace.getConfiguration("promptrocket").get("assistantName", []);
        const welcomeMessage = `Welcome back ${userName}! How can I assist you today? 👩‍💻👨‍💻🚀`;
        const configuration = vscode.workspace.getConfiguration('editor');
        const fontSize = configuration.get('fontSize') as number;
        const lineHeight = configuration.get('lineHeight') as number;
        const lineHeightInt = Math.floor(fontSize * lineHeight);

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
                <style>
                    :root {
                        --vscode-line-height: ${lineHeight};
                    }
                </style>
            <title>Chat Panel</title>
        </head>
        <body>
        <app>
            <script src="${marked}"></script>
            <div id="output-container">
                <div id="message-list">
                    <div class="assistant-message-wrapper"> 
                        <div class="sender-assistant"><span class="fa-solid fa-user-astronaut margin-right-5"></span><span>${assistantName}</span></div><div class="assistant-message">
                        <p>${welcomeMessage}</p>
                        </div>
                    </div>
                </div>
            </div>
            <div id="model-bar">
                <div class="model-text">
                Model: GPT-3.5-Turbo
                </div>
            </div>
	        <div id="input-container">
                <textarea class="inputbox" id="user-input" rows="1" placeholder="'/help' to see quick commands."></textarea>
                <button class="button-overlap-inputbox" id="send-button">
                    <i class="fa-regular fa-paper-plane"></i>
                </button>
            </div>
        </app>
        <script src="${mainScript}"></script>
        </body>
        </html>`;
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

    private async _inputCommands(text: string, inputFromWebview: boolean = true) {
        // Remove whitespace
        const split = text.trim().split(' ');
        const cmd = split[0];
        const args = split[1];

        // Update
        this._config = vscode.workspace.getConfiguration("promptrocket");

        if (cmd === '/clear') {
            vscode.commands.executeCommand('promptrocket.newChat');
        }
        else if (cmd === '/model') {
            const currentModel = this._config.get("useGPT4", false);
            this._config.update("useGPT4", !currentModel, true);
            const modelText = currentModel ? "GPT-3.5-Turbo" : "GPT-4";
            await this._postSystemMessage(`Switched model to ${modelText}.`, false);
            this._view?.webview.postMessage({ command: 'setModel', text: modelText });

        }
        else if (cmd === '/temp') {
            const temp = args as unknown as number;
            const oldValue = this._config.get("temperature", 1);
            if (isNaN(temp) || temp < 0 || temp > 2) {
                this._config.update("temperature", temp, true);
                await this._postSystemMessage(`Temperature must be a number between 0 and 2.`, false);
            }
            else {
                await this._postSystemMessage(`Changed temperature ${oldValue} -> ${temp}.`, false);
            }
        }
        else if (cmd === '/topp') {
            const topp = args as unknown as number;
            const oldValue = this._config.get("top_p", 1);
            if (isNaN(topp) || topp < 0 || topp > 1) {
                this._config.update("top_p", topp, true);
                await this._postSystemMessage(`Top P must be a number between 0 and 1.`, false);
            }
            else {
                await this._postSystemMessage(`Changed Top P ${oldValue} -> ${topp}.`, false);
            }
        }

        else if (cmd === '/presence') {
            const presence = args as unknown as number;
            const oldValue = this._config.get("presence_penalty", 0);
            if (isNaN(presence) || presence < -2 || presence > 2) {
                this._config.update("presence_penalty", presence, true);
                await this._postSystemMessage(`Presence penalty must be a number between -2 and 2.`, false);
            }
            else {
                await this._postSystemMessage(`Changed presence penalty ${oldValue} -> ${presence}.`, false);
            }
        }
        else if (cmd === '/freq') {
            const freq = args as unknown as number;
            const oldValue = this._config.get("frequency_penalty", 0);
            if (isNaN(freq) || freq < 2 || freq > -2) {
                this._config.update("frequency_penalty", freq, true);
                await this._postSystemMessage(`Frequency penalty must be a number between -2 and 2.`, false);
            }
            else {
                await this._postSystemMessage(`Changed frequency penalty ${oldValue} -> ${freq}.`, false);
            }
        }
        else if (cmd === '/buffer') {
            if (this._codeblockBuffer) {
                await this._postSystemMessage(`\`\`\`buffer ${this._codeblockBuffer}\`\`\``, false);
            }
            else {
                await this._postSystemMessage("Buffer is empty.", false);
            }
        }
        else if (cmd === '/insert') {
            if (this._codeblockBuffer) {
                vscode.commands.executeCommand('promptrocket.insertLastCodeblock', false);
            }
            else {
                await this._postSystemMessage("Buffer is empty.", false);
            }
        }
        else if (cmd === '/help') {
            let helpText = 'Here are your quick commands 🚀: <br><br>';
            helpText += "/clear: Start a new chat<br>";
            helpText += "/model: Switch between GPT-3 and GPT-4<br>";
            helpText += "/temp: Set temperature (0-2)<br>";
            helpText += "/topp: Set top P (0-1)<br>";
            helpText += "/presence: Set presence penalty (-2-2)<br>";
            helpText += "/freq: Set frequency penalty (-2-2)<br>";
            helpText += "/buffer: Shows current code block buffer ready to be inserted into editor.<br>";
            helpText += "/insert: Insert the last codeblock.<br>";
            helpText += "/help: Show this help message.";

            await this._postSystemMessage(helpText, false);
        }
        else {
            await this._postSystemMessage("Unknown command. Type /help for a list of commands.", false);
        }

        if (inputFromWebview) {
            this._focusInputBox();
        }
    }
}