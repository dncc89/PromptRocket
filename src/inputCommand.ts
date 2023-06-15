import * as vscode from 'vscode';

export class InputCommand {
    private _context?: vscode.ExtensionContext;
    private _view?: vscode.WebviewView;
    private _globalState: vscode.Memento;

    constructor(context: vscode.ExtensionContext, view: vscode.WebviewView) {
        this._view = view;
        this._context = context;
        this._globalState = context.globalState;
    }

    async processInput(text: string, inputFromWebview: boolean = true) {
        let config = vscode.workspace.getConfiguration("promptrocket");
        // Remove whitespace
        const split = text.trim().split(' ');
        const cmd = split[0];
        const args = split[1];

        // Update
        config = vscode.workspace.getConfiguration("promptrocket");

        if (cmd === '/clear') {
            vscode.commands.executeCommand('promptrocket.newChat');
        }
        else if (cmd === '/temp') {
            const temp = args as unknown as number;
            const oldValue = config.get("temperature", 1);
            if (isNaN(temp) || temp < 0 || temp > 2) {
                config.update("temperature", temp, true);
                await this._postSystemMessage(`Temperature must be a number between 0 and 2.`, false);
            }
            else {
                await this._postSystemMessage(`Changed temperature ${oldValue} -> ${temp}.`, false);
            }
        }
        else if (cmd === '/topp') {
            const topp = args as unknown as number;
            const oldValue = config.get("top_p", 1);
            if (isNaN(topp) || topp < 0 || topp > 1) {
                config.update("top_p", topp, true);
                await this._postSystemMessage(`Top P must be a number between 0 and 1.`, false);
            }
            else {
                await this._postSystemMessage(`Changed Top P ${oldValue} -> ${topp}.`, false);
            }
        }
        else if (cmd === '/presence') {
            const presence = args as unknown as number;
            const oldValue = config.get("presence_penalty", 0);
            if (isNaN(presence) || presence < -2 || presence > 2) {
                config.update("presence_penalty", presence, true);
                await this._postSystemMessage(`Presence penalty must be a number between -2 and 2.`, false);
            }
            else {
                await this._postSystemMessage(`Changed presence penalty ${oldValue} -> ${presence}.`, false);
            }
        }
        else if (cmd === '/freq') {
            const freq = args as unknown as number;
            const oldValue = config.get("frequency_penalty", 0);
            if (isNaN(freq) || freq < 2 || freq > -2) {
                config.update("frequency_penalty", freq, true);
                await this._postSystemMessage(`Frequency penalty must be a number between -2 and 2.`, false);
            }
            else {
                await this._postSystemMessage(`Changed frequency penalty ${oldValue} -> ${freq}.`, false);
            }
        }
        else if (cmd === '/buffer') {
            const codeblock = this._globalState.get("codeblock");
            if (codeblock) {
                await this._postSystemMessage(`\`\`\`buffer ${codeblock}\`\`\``, false);
            }
            else {
                await this._postSystemMessage("Buffer is empty.", false);
            }
        }
        else if (cmd === '/insert') {
            const codeblock = this._globalState.get("codeblock");
            if (codeblock) {
                vscode.commands.executeCommand('promptrocket.insertLastCodeblock', false);
            }
            else {
                await this._postSystemMessage("Buffer is empty.", false);
            }
        }
        else if (cmd === '/help') {
            let helpText = 'Here are your quick commands 🚀: <br><br>';
            helpText += "/clear: Start a new chat<br>";
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

    private async _postSystemMessage(text: string, isUserMessage: boolean = true) {
        await this._view?.webview.postMessage({
            command: 'populateMessage',
            text: text,
            isUserMessage: isUserMessage,
            isNewMessage: false,
            isSystemMessage: true
        });
    }

    private _focusInputBox() {
        this._view?.webview.postMessage({
            command: "focusInputBox"
        });
    }
}