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

        if (cmd === '/clear') {
            vscode.commands.executeCommand('promptrocket.newChat');
        }
        else if (cmd === '/temp') {
            const temp = args as unknown as number;
            const oldValue = config.get("temperature", 1);
            if (isNaN(temp) || temp < 0 || temp > 2) {
                config.update("temperature", temp, true);
                await this._postMessage(`Temperature must be a number between 0 and 2.`, 'system');
            }
            else {
                await this._postMessage(`Changed temperature ${oldValue} -> ${temp}.`, 'system');
            }
        }
        else if (cmd === '/topp') {
            const topp = args as unknown as number;
            const oldValue = config.get("top_p", 1);
            if (isNaN(topp) || topp < 0 || topp > 1) {
                config.update("top_p", topp, true);
                await this._postMessage(`Top P must be a number between 0 and 1.`, 'system');
            }
            else {
                await this._postMessage(`Changed Top P ${oldValue} -> ${topp}.`, 'system');
            }
        }
        else if (cmd === '/presence') {
            const presence = args as unknown as number;
            const oldValue = config.get("presence_penalty", 0);
            if (isNaN(presence) || presence < -2 || presence > 2) {
                config.update("presence_penalty", presence, true);
                await this._postMessage(`Presence penalty must be a number between -2 and 2.`, 'system');
            }
            else {
                await this._postMessage(`Changed presence penalty ${oldValue} -> ${presence}.`, 'system');
            }
        }
        else if (cmd === '/freq') {
            const freq = args as unknown as number;
            const oldValue = config.get("frequency_penalty", 0);
            if (isNaN(freq) || freq < 2 || freq > -2) {
                config.update("frequency_penalty", freq, true);
                await this._postMessage(`Frequency penalty must be a number between -2 and 2.`, 'system');
            }
            else {
                await this._postMessage(`Changed frequency penalty ${oldValue} -> ${freq}.`, 'system');
            }
        }
        else if (cmd === '/buffer') {
            const codeblock = this._globalState.get("codeblock");
            if (codeblock) {
                await this._postMessage(`\`\`\`buffer ${codeblock}\`\`\``, 'system');
            }
            else {
                await this._postMessage("Buffer is empty.", 'system');
            }
        }
        else if (cmd === '/insert') {
            const codeblock = this._globalState.get("codeblock");
            if (codeblock) {
                vscode.commands.executeCommand('promptrocket.insertLastCodeblock', false);
            }
            else {
                await this._postMessage("Buffer is empty.", 'system');
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

            await this._postMessage(helpText, 'system');
        }
        else {
            await this._postMessage("Unknown command. Type /help for a list of commands.", 'system');
        }

        if (inputFromWebview) {
            this._focusInputBox();
        }
    }

    private async _postMessage(text: string, sender: string) {
        await this._view?.webview.postMessage({
            command: 'showMessage',
            text: text,
            sender: sender,
            isNewMessage: false,
        });
    }

    private _focusInputBox() {
        this._view?.webview.postMessage({
            command: "focusInputBox"
        });
    }
}