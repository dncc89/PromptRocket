import * as templates from './templates';
import * as vscode from 'vscode';

import { ICommandTemplate, IMessage, IMessageTemplate } from './interfaces';

import { ChatView } from './chatview';

export async function activate(context: vscode.ExtensionContext) {
    // Check if API key is set
    let disposableSetKey = vscode.commands.registerCommand("promptrocket.setkey", async () => {
        let apiKey = await vscode.window.showInputBox({
            prompt: "Enter OpenAI API Key",
            password: true
        });

        if (apiKey) {
            context.secrets.store("openAIKey", apiKey);
            vscode.window.showInformationMessage("API Key set successfully");
            vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
    });
    const apiKey = await context.secrets.get("openAIKey");
    if (apiKey === undefined) {
        vscode.window.showErrorMessage("API Key is missing. Please set it using the command 'Set OpenAI API Key'");
        return;
    }

    // Create chat view
    let chatview = new ChatView(context, apiKey);

    let disposableNewChat = vscode.commands.registerCommand("promptrocket.newChat", async () => {
        chatview.startNewChat([], '');
    });

    let disposableSendMessage = vscode.commands.registerCommand("promptrocket.sendMessage", async () => {
        let message = await vscode.window.showInputBox({
            prompt: "What's on your mind?",
        }) || "";
        if (message.length > 0) {
            chatview.sendUserMessage(message, true, false);
        }
    });

    // Register the "promptrocket.commandFromTemplates" command and handle user input
    let disposableOpenChatTemplate = vscode.commands.registerCommand("promptrocket.openChatTemplate", async () => {
        // Add quickpick list in the chat template command
        let templateList: ICommandTemplate[] = templates.getChatTemplates();
        let quickPickItems: vscode.QuickPickItem[] = templateList.map(template => ({ label: template.name }));
        quickPickItems.push({ label: "+ Add new template" });

        let selectedTemplate = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: "Select a template or add a new one",
        });

        if (selectedTemplate) {
            if (selectedTemplate.label === "+ Add new template") {
                vscode.commands.executeCommand("workbench.action.openSettings", "promptrocket.templates");
            } else {
                // If template has argument enabled, show input box
                const chatTemplate = templates.findChatTemplates(selectedTemplate.label);
                let argument = "";

                if (chatTemplate.argument) {
                    argument = await vscode.window.showInputBox({
                        prompt: "What's on your mind?",
                    }) || "";

                    // Return there's no required input
                    if (argument === "") {
                        return;
                    }
                }
                chatview.startNewChat(chatTemplate.prompts || [], argument);
            }
        }
    });

    let disposableOpenMessageShortcut = vscode.commands.registerCommand("promptrocket.openMessageShortcut", async () => {
        // Add quickpick list in the chat template command
        let templateList: IMessageTemplate[] = templates.getMessageTemplates();
        let quickPickItems: vscode.QuickPickItem[] = templateList.map(template => ({ label: template.name }));
        quickPickItems.push({ label: "+ Add new template" });

        let selectedTemplate = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: "Select a shortcut or add a new one",
        });

        if (selectedTemplate) {
            if (selectedTemplate.label === "+ Add new template") {
                vscode.commands.executeCommand("workbench.action.openSettings", "promptrocket.messageShortcuts");
            } else {
                // If template has argument enabled, show input box
                const messageTemplate = templates.findMessageTemplate(selectedTemplate.label);
                let argument = "";

                if (messageTemplate.argument) {
                    if (messageTemplate.argument) {
                        argument = await vscode.window.showInputBox({
                            prompt: "What's on your mind?",
                        }) || "";
                    }

                    // Return there's no required input
                    if (argument === "") {
                        return;
                    }
                    chatview.sendUserMessage(`${messageTemplate.prompt}: "${argument}"`, true, false);
                }
                else {
                    chatview.sendUserMessage(`${messageTemplate.prompt}`, true, false);
                }
            }
        }
    });

    let disposableOpenSettings = vscode.commands.registerCommand("promptrocket.openSettings", async () => {
        vscode.commands.executeCommand("workbench.action.openSettings", "promptrocket");
    });

    let disposableShowChatPanel = vscode.commands.registerCommand("promptrocket.showChatPanel", async () => {
        vscode.commands.executeCommand('workbench.view.extension.promptrocket-container');
    });

    let disposableInsertCodeblock = vscode.commands.registerCommand("promptrocket.insertLastCodeblock", async () => {
        chatview.insertLastCodeblock();
    });

    context.subscriptions.push(disposableSendMessage);
    context.subscriptions.push(disposableOpenSettings);
    context.subscriptions.push(disposableNewChat);
    context.subscriptions.push(disposableOpenChatTemplate);
    context.subscriptions.push(disposableOpenMessageShortcut);
    context.subscriptions.push(disposableInsertCodeblock);
    context.subscriptions.push(disposableSetKey);
    context.subscriptions.push(disposableShowChatPanel);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatView.viewType, chatview));
}

export function deactivate() { }