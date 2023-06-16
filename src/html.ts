import * as vscode from 'vscode';

export function getHtmlForWebview(context: vscode.ExtensionContext, webview: vscode.Webview): string {
    const userName = vscode.workspace.getConfiguration("promptrocket").get("userName", "User");
    const assistantName = vscode.workspace.getConfiguration("promptrocket").get("assistantName", "PromptRocket");
    const modelName = (vscode.workspace.getConfiguration("promptrocket").get("model", []) || "").toString();
    const welcomeMessage = `Welcome back ${userName}! How can I assist you today? 👩‍💻👨‍💻🚀`;
    const configuration = vscode.workspace.getConfiguration('editor');
    const fontSize = configuration.get('fontSize') as number;
    const lineHeight = configuration.get('lineHeight') as number;
    const lineHeightInt = Math.floor(fontSize * lineHeight);

    const scriptPathOnDisk = vscode.Uri.joinPath(context.extensionUri, 'media', 'main.js');
    const cssPathOnDisk = vscode.Uri.joinPath(context.extensionUri, 'media', 'main.css');
    const codiconsUri = vscode.Uri.joinPath(context.extensionUri, 'media', 'codicon.css');
    const fontawesomeUri = vscode.Uri.joinPath(context.extensionUri, 'media', 'fontawesome.css');
    const markedUri = vscode.Uri.joinPath(context.extensionUri, 'media', 'marked.min.js');

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
                <select id="model-select">
                    <option value="gpt-3.5-turbo-0613" ${modelName === "gpt-3.5-turbo-0613" ? "selected" : ""}>gpt-3.5-turbo-0613</option>
                    <option value="gpt-3.5-turbo-16k-0613" ${modelName === "gpt-3.5-turbo-16k-0613" ? "selected" : ""}>gpt-3.5-turbo-16k-0613</option>
                    <option value="gpt-4-0613" ${modelName === "gpt-4-0613" ? "selected" : ""}>gpt-4-0613</option>
                </select>
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