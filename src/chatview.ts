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
    private _currentLoop: number = 0;
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
        this._initToggle();
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
        console.log(this._messages);
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
                this._currentLoop = 0;
                await this._returnMessage(text, 'user', '', inputFromWebview);
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
                    this.sendUserMessage(message.text, true, true);
                    break;
                case 'userMessageModify':
                    this._updateMessageArray(message.id);
                    this._returnMessage(message.text, 'user', '', true);
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
                case 'toggleFunctions':
                    this._toggleFunctions();
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
        const username = config.get("userName", "User");
        const assistantname = config.get("assistantName", "PromptRocket");
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

    private async _returnMessage(text: string, requester: string, functionName: string = "", inputFromWebview: boolean) {
        try {
            // Get text selectio
            const selection = await utils.getContext();
            let context = `Context:\`\`\`${selection}\`\`\`\n`;
            if (selection[1] === '' || selection[1] === this._textSelection) {
                context = '';
            }
            this._textSelection = selection[1];
            if (requester !== 'user') {
                context = '';
            }

            const requestMessage: IMessage = {
                role: requester,
                hiddenContext: context,
                content: text,
                name: functionName,
            };
            this._messages.push(requestMessage);
            this._saveMessages();

            if (this._currentLoop > 10 && requester === 'function') {
                return;
            }

            this._cancelToken = false;
            const maxLines = this._config.get<number>('contextLength') || 20;
            let cmd = [
                {
                    "name": "get_context",
                    "description": "Retrieve what user is currently looking at",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "lines": {
                                "type": "number",
                                "description": `Lines of context around where the user's cursor is. Increase range to see more context. range is 1-${maxLines}}`,
                            },
                        },
                        "required": ["lines"],
                    },
                },
                {
                    "name": "get_project_files",
                    "description": "Get list of project files",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "request": {
                                "type": "string",
                                "description": "Return empty string to get results",
                            },
                        },
                        "required": ["request"],
                    },
                },
                {
                    "name": "get_symbols",
                    "description": "Access to symbols inside a file",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "filename": {
                                "type": "string",
                                "description": "File name to retrieve symbols, return empty string to access current file",
                            },
                        },
                        "required": ["filename"],
                    },
                },
                {
                    "name": "get_diagnostics",
                    "description": "Retrieve semantic errors. Assistant can detect typos and syntax errors but diagnostics cannot, so code must be reviewed by assistant first before calling this command.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "request": {
                                "type": "string",
                                "description": "Return empty string to get results",
                            },
                        },
                        "required": ["request"],
                    },
                },
                {
                    "name": "send_text",
                    "description": "Send the text to where cursor is at, and retrieve what text was sent. This will not run a VSCode command.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "text": {
                                "type": "string",
                                "description": "Code or text to send"
                            },
                        },
                        "required": ["text"],
                    },
                },
                {
                    "name": "find_and_select_text",
                    "description": "Select a text in editor. This can be used for user's attention, search text, or editing text.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "text": {
                                "type": "string",
                                "description": "Code or text to send"
                            },
                        },
                        "required": ["text"],
                    },
                },
                {
                    "name": "search_text",
                    "description": "Runs an advanced AI search engine to find a relevant text in the file.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "filename": {
                                "type": "string",
                                "description": "File name to search text, return empty string to search current file",
                            },
                            "query": {
                                "type": "string",
                                "description": "Use natural language query, e.g. Where is the function to get the current time."
                            },
                        },
                        "required": ["filename", "query"],
                    },
                },
                {
                    "name": "run_command",
                    "description": "Run VSCode command and retrive what action was performed.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {
                                "type": "string",
                                "description": "VSCode command, e.g. 'editor.action.formatDocument'"
                            },
                        },
                        "required": ["command"],
                    },
                }
            ];

            if (!this._globalState.get('useFunctions')) {
                cmd = [];
            }

            const p = await payload.generatePayload(this._messages, this._apiKey, cmd);
            const stream = message.streamCompletion(p);

            let i = 0;
            let newMessage = '';
            let funcName = 'chat';

            stream.on('data', (chunk) => {
                funcName = chunk[0];
                newMessage += chunk[1];
                const sender = funcName === 'chat' ? 'assistant' : 'function';
                this._view?.webview.postMessage({
                    command: 'chatStreaming',
                    text: chunk[1],
                    sender: sender,
                    isNewMessage: i === 0
                });

                if (i === 0) {
                    this._messages.push({
                        role: sender,
                        content: newMessage
                    });
                }

                this._messages[this._messages.length - 1].content = newMessage;
                this._messages[this._messages.length - 1].role = sender;
                this._saveMessages();
                i++;

                if (this._cancelToken) {
                    stream.removeAllListeners();
                    return;
                }
            });

            stream.on('end', () => {
                this._view?.webview.postMessage({
                    command: 'chatStreaming',
                    isCompletionEnd: true
                });

                if (inputFromWebview) {
                    this._focusInputBox();
                }

                // Parse the function call and return the result to streamcompletion
                if (funcName !== 'chat') {
                    this._handleFunctions(funcName, JSON.parse(newMessage), inputFromWebview);
                }

                // Reset the current message for the next message
                newMessage = '';
                this._currentLoop++;
            });

            stream.on('error', (error) => {
                console.error(`Error while streaming completion: ${error}`);
            });

        } catch (error) {
            console.error(`Error while sending message: ${error}`);
        }
    }

    private async _handleFunctions(funcName: string, request: any, inputFromWebview: boolean) {
        console.log(`Calling function: ${funcName}`);
        let result = '';
        switch (funcName) {
            case 'get_context':
                result = await this._getContext(request.lines);
                break;
            case 'get_project_files':
                result = await this._getProjectFiles();
                break;
            case 'get_symbols':
                result = await this._getSymbols(request.filename);
                break;
            case 'get_diagnostics':
                result = await this._getDiagnostics();
                break;
            case 'send_text':
                result = await this._insertText(request.text);
                break;
            case 'run_command':
                result = await this._runCommand(request.command);
                break;
            case 'search_text':
                result = await this._searchText(request.filename, request.query);
                break;
            case 'find_and_select_text':
                result = await this._findAndSelectText(request.text);
                break;

        }

        if (result === '') {
            result = "['function failed. return to conversation for further instruction.']";
        }
        this._postMessage(result, 'function');
        this._returnMessage(result, 'function', funcName, inputFromWebview);
    }

    private async _getContext(lines: number) {
        const context = await utils.getContext(lines);
        const result = JSON.stringify({
            "file_language": await utils.getLanguageID(),
            "context_before": context[0],
            "context_after": context[2],
            "text_selection": context[1],
        }, null, 2);
        return `{ "context": ${result} } `;
    }

    private async _getSymbols(filename = '') {
        const symbols = JSON.stringify(await utils.getSymbols(filename), null, 2);
        return `{ "symbols": ${symbols} } `;
    }

    private async _getProjectFiles() {
        const files = JSON.stringify(await utils.getProjectFiles(), null, 2);
        return `{ "files": ${files} } `;
    }


    private async _getDiagnostics() {
        const diagnostics = JSON.stringify(await utils.getDiagnostics(), null, 2);
        return `{ "diagnostics": ${diagnostics} }`;
    }


    private async _insertText(text: string) {
        utils.replaceSelectedText(text);
        const result = JSON.stringify(text, null, 2);
        return `{ "text_sent": ${result} }`;
    }

    private async _runCommand(text: string) {
        try {
            await vscode.commands.executeCommand(text);
            const result = JSON.stringify(text, null, 2);
            return `{ "command_sent": ${result} }`;
        }
        catch
        {
            return `{ "command_sent": 'command not found' }`;
        }
    }

    private async _searchText(filename: string, query: string) {
        const p = await payload.generateSearchPayload(filename, query, this._apiKey);
        const response = await message.simpleCompletion(p);
        const result = JSON.stringify(response, null, 2);
        return `{ "search_result": ${result} }`;
    }

    private async _findAndSelectText(text: string) {
        try {
            await utils.findAndSelectText(text);
            const result = JSON.stringify(text, null, 2);
            return `{ "text_selected":${result} }`;
        }
        catch {
            return `{ "text_selected":'failed' }`;
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

    private _initToggle() {
        // Check if the globalState has the 'useFunctions' key
        if (!this._globalState.get('useFunctions')) {
            // If not, initialize it to false
            this._globalState.update('useFunctions', true);
        }
        this._view?.webview.postMessage({
            command: "initializeFunctions",
            useFunctions: this._globalState.get('useFunctions')
        });
    }

    private _toggleFunctions() {
        // Get the current state of the functions in globalState
        const currentState = this._globalState.get('useFunctions');
        this._globalState.update('useFunctions', !currentState);
        this._view?.webview.postMessage({
            command: "toggleFunctions",
            useFunctions: !currentState
        });
        if (!currentState) {
            this._postMessage('Enabled functions call', 'system');
        }
        else {
            this._postMessage('Disabled functions call', 'system');
        }
    }
}