import * as vscode from 'vscode';

import { ICommandTemplate, IMessageTemplate } from './interfaces';

export function getChatTemplates() {
    const config = vscode.workspace.getConfiguration("promptrocket");
    let templates: ICommandTemplate[] = config.get("chatTemplates", []);
    return templates;
}

export function findChatTemplates(name: string) {
    const emptyCommand: ICommandTemplate = { name: "" };
    const template: ICommandTemplate = getChatTemplates().find((template: ICommandTemplate) => template.name === name) || emptyCommand;
    return template;
}

export function getMessageTemplates() {
    const config = vscode.workspace.getConfiguration("promptrocket");
    let templates: IMessageTemplate[] = config.get("messageShortcuts", []);
    return templates;
}

export function findMessageTemplate(name: string) {
    const emptyCommand: IMessageTemplate = { name: "", prompt: "" };
    const template: IMessageTemplate = getMessageTemplates().find((template: IMessageTemplate) => template.name === name) || emptyCommand;
    return template;
}