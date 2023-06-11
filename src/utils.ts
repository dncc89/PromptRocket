import * as vscode from 'vscode';
const yaml = require('js-yaml');

export function getLanguageID() {
    const activeEditor = vscode.window.activeTextEditor;
    // Get the language of the current open file
    if (activeEditor) {
        const languageId = activeEditor.document.languageId;
        return languageId;
    }
    return 'PlainText';
}

export function getContext() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const config = vscode.workspace.getConfiguration('promptrocket');
        const selection = editor.selection;
        const document = editor.document;
        const contextLength = config.get<number>('contextLength') || 5;

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

export function replaceSelectedText(text: string) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const selection = editor.selection;
        editor.edit((editBuilder) => {
            editBuilder.replace(selection, text);
        });
    }
}

export function getDiagnostics() {
    const activeEditor = vscode.window.activeTextEditor;
    const activeDocument = activeEditor?.document;
    const selection = activeEditor?.selection;
    const startPosition = selection?.start;
    const endPosition = selection?.end;

    let errorMessages = [];
    if (startPosition && endPosition && activeDocument) {
        const diagnostics = vscode.languages.getDiagnostics(activeDocument.uri);
        for (const diagnostic of diagnostics) {
            if (
                (diagnostic.range.start.isBeforeOrEqual(startPosition) && diagnostic.range.end.isAfterOrEqual(startPosition)) ||
                (diagnostic.range.start.isBeforeOrEqual(endPosition) && diagnostic.range.end.isAfterOrEqual(endPosition))
            ) {
                errorMessages.push(diagnostic.message);
                vscode.window.showErrorMessage(`promptrocket: ${diagnostic.message}`);
            }
        }
    }
    if (errorMessages.length > 0) {
        const errorDetails = errorMessages.map((message, index) => ({
            [`Diagnostics`]: {
                message: `(error) ${message}`,
            },
        }));
        return yaml.dump(errorDetails);
    }
    else {
        return '';
    }
}