import * as vscode from 'vscode';
const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');
const gitignoreParser = require('gitignore-parser');

export async function getLanguageID() {
    const activeEditor = vscode.window.activeTextEditor;
    // Get the language of the current open file
    if (activeEditor) {
        const languageId = activeEditor.document.languageId;
        return languageId;
    }
    return 'PlainText';
}

export async function getSymbols(filename: string = '') {
    const activeEditor = vscode.window.activeTextEditor;

    // if filename is not specified, use the active document
    let activeDocument = activeEditor?.document;
    if (filename.length > 0) {
        const documents = vscode.workspace.textDocuments;
        const document = documents.find(document => document.fileName.endsWith(filename));
        if (document) {
            activeDocument = document;
        }
    }

    // List all symbols in this document
    let symbolList: any = [];
    if (activeDocument) {
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeDocumentSymbolProvider',
            activeDocument.uri
        );

        if (symbols) {
            symbols.forEach(symbol => {
                // convert kind to readable string
                let kind = vscode.SymbolKind[symbol.kind];
                kind = kind.charAt(0).toUpperCase() + kind.slice(1);

                // get symbol arguments
                let args = '';
                if (symbol.kind === vscode.SymbolKind.Function) {
                    const functionPattern = new RegExp(`${symbol.name}\\((.*)\\)`);
                    const match = activeDocument?.getText().match(functionPattern);
                    if (match) {
                        args = match[1];
                    }
                }

                // add symbol to the list
                symbolList.push({
                    kind: kind,
                    name: symbol.name,
                    args: args,
                });
            });
        } else {
            symbolList = ['No symbol'];
        }
    } else {
        symbolList = ['No active document '];
    }
    return symbolList;
}

export async function getContext(lines: number = 5) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const config = vscode.workspace.getConfiguration('promptrocket');
        const selection = editor.selection;
        const document = editor.document;
        const maxLines = config.get<number>('contextLength') || 20;
        let contextLength = lines;
        if (contextLength > maxLines) {
            contextLength = maxLines;
        }

        // Determine the start and end lines based on the selection
        const startLine = Math.max(selection.start.line - contextLength, 0);
        const endLine = Math.min(selection.end.line + contextLength, document.lineCount - 1);

        let textBeforeCursor = '';
        for (let line = startLine; line < selection.start.line; line++) {
            textBeforeCursor += document.lineAt(line).text + '\n';
        }

        let selectedText = editor.document.getText(selection);
        selectedText = selection.isEmpty ? '' : `${selectedText}`;

        let textAfterCursor = '';
        for (let line = selection.end.line + 1; line <= endLine; line++) {
            textAfterCursor += document.lineAt(line).text + '\n';
        }

        return [textBeforeCursor, selectedText, textAfterCursor];
    }
    else {
        return ['', '', ''];
    }
}

export async function getProjectFiles() {
    const editor = vscode.window.activeTextEditor;
    let result = [];
    if (editor) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            const workspaceFolder = workspaceFolders[0];
            // find files that not gitignored
            const gitignorePath = path.join(workspaceFolder.uri.fsPath, '.gitignore');
            if (fs.existsSync(gitignorePath)) {
                const gitignoreContent = fs.readFileSync(gitignorePath).toString();
                const gitignore = gitignoreParser.compile(gitignoreContent);
                // list all files that not gitignored
                let files = fs.readdirSync(workspaceFolder.uri.fsPath);
                // get files under folders
                const folders = files.filter((file: string) => fs.statSync(path.join(workspaceFolder.uri.fsPath, file)).isDirectory());
                folders.forEach((folder: string) => {
                    const folderFiles = fs.readdirSync(path.join(workspaceFolder.uri.fsPath, folder));
                    files = files.concat(folderFiles.map((file: string) => path.join(folder, file)));
                });

                const notIgnoredFiles = files.filter((file: string) => !gitignore.denies(file));
                result = notIgnoredFiles;
            }
            else {
                // just list all files
                const files = fs.readdirSync(workspaceFolder.uri.fsPath);
                result = files;
            }
        }
        else {
            result = ['No file'];
        }
    }
    return result;
}

export async function replaceSelectedText(text: string) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const selection = editor.selection;
        editor.edit((editBuilder) => {
            editBuilder.replace(selection, text);
        });
    }
}

export async function getDiagnostics() {
    const activeEditor = vscode.window.activeTextEditor;
    const activeDocument = activeEditor?.document;
    const selection = activeEditor?.selection;
    const startPosition = selection?.start.line || 0 - 5 < 0 ? 0 : selection?.start.translate(-5, 0);
    const documentLength = activeDocument?.lineCount || 0;
    const endLine = selection?.end.line || 0;
    const endPosition = endLine + 5 > documentLength ? new vscode.Position(documentLength, 0) : selection?.end.translate(5, 0);
    let errorMessages = [];
    if (startPosition && endPosition && activeDocument) {
        const diagnostics = vscode.languages.getDiagnostics(activeDocument.uri);
        for (const diagnostic of diagnostics) {
            if (
                (diagnostic.range.start.isAfterOrEqual(startPosition) &&
                    diagnostic.range.end.isBeforeOrEqual(endPosition))
            ) {

                // retrieve code for this range
                const code = activeDocument.getText(diagnostic.range);
                errorMessages.push({
                    code: code,
                    message: diagnostic.message,
                });

                if (errorMessages.length > 5) {
                    break;
                }
            }
        }
    }
    if (errorMessages.length === 0) {
        errorMessages = ['No error'];
    }

    return errorMessages;
}

export async function findAndSelectText(text: string) {
    console.log(text);
    let result = 'no active editor';
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        let document = editor.document;
        let fullText = document.getText();
        let cursorPosition = editor.selection.active;
        let cursorOffset = document.offsetAt(cursorPosition);

        let closestIndex = -1;
        let closestDistance = Infinity;
        let index = fullText.indexOf(text);
        while (index !== -1) {
            let distance = Math.abs(cursorOffset - index);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = index;
            }
            index = fullText.indexOf(text, index + 1);
        }

        if (closestIndex !== -1) {
            let start = document.positionAt(closestIndex);
            let end = document.positionAt(closestIndex + text.length);
            let range = new vscode.Range(start, end);

            editor.selection = new vscode.Selection(range.start, range.end);
            // return new selected text
            result = vscode.window.activeTextEditor?.document.getText(vscode.window.activeTextEditor?.selection) || 'failed to select text';
        } else {
            result = 'couldn\'t find text';
        }
    }
    return result;
}

export async function readWholeFile(filename: string) {
    let result = 'no active editor';
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        if (!filename) {
            const document = editor.document;
            result = document.getText();
        } else {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                const workspaceFolder = workspaceFolders[0];
                const filePath = path.join(workspaceFolder.uri.fsPath, filename);
                if (fs.existsSync(filePath)) {
                    result = fs.readFileSync(filePath).toString();
                }
                else {
                    result = 'file not found';
                }
            }
        }
    }
    return result;
}