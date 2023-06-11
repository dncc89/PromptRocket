import * as vscode from 'vscode';

import { ICommand } from './interfaces';

export function getChatTemplates() {
    const config = vscode.workspace.getConfiguration("promptrocket");
    let templates: ICommand[] = config.get("chatTemplates", []);
    return templates;
}

export function findChatTemplates(name: string) {
    const emptyCommand: ICommand = { name: "" };
    const template: ICommand = getChatTemplates().find((template: ICommand) => template.name === name) || emptyCommand;
    return template;
}

export function getCommandTemplates() {
    const config = vscode.workspace.getConfiguration("promptrocket");
    let templates: ICommand[] = config.get("commandTemplates", []);
    return templates;
}

export function findCommandTemplates(name: string) {
    const emptyCommand: ICommand = { name: "" };
    const template: ICommand = getCommandTemplates().find((template: ICommand) => template.name === name) || emptyCommand;
    return template;
}