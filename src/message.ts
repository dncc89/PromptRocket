import * as utils from "./utils";
import * as vscode from "vscode";

import { EventEmitter } from 'events';
import { IMessage } from './interfaces';

const { TextDecoder } = require("util");
const { Writable } = require("stream");
const fetch = require("cross-fetch");

export const streamCompletion = (payload: any) => {
    const emitter = new EventEmitter();

    fetch("https://api.openai.com/v1/chat/completions", payload)
        .then((res: { ok: any; body: { pipe: (arg0: any) => void; }; }) => {
            if (!res.ok || !res.body) {
                throw new Error(JSON.stringify(res));
            }

            let buffer = "";
            let funcName = "";
            const textDecoder = new TextDecoder();

            const writable = new Writable({
                write(chunk: any, encoding: any, callback: any) {
                    buffer += textDecoder.decode(chunk, { stream: true });
                    processBuffer();
                    callback();
                }
            });

            const processBuffer = () => {
                while (true) {
                    const newlineIndex = buffer.indexOf("\n");
                    if (newlineIndex === -1) {
                        break;
                    }

                    const line = buffer.slice(0, newlineIndex);
                    buffer = buffer.slice(newlineIndex + 1);

                    if (line.includes("[DONE]")) {
                        writable.end();
                        break;
                    }

                    if (!line.startsWith("data:")) {
                        continue;
                    }

                    const jsonData = JSON.parse(line.slice(5));
                    const content = jsonData.choices[0].delta.content;
                    const argument = jsonData.choices[0].delta.function_call?.arguments;
                    const name = jsonData.choices[0].delta.function_call?.name;
                    if (name?.length > 0) {
                        funcName = name;
                    }

                    if (!content && !argument) {
                        continue;
                    }

                    if (content) {
                        emitter.emit('data', ['chat', content]);
                    } else if (argument) {
                        emitter.emit('data', [funcName, argument]);
                    }
                }
            };

            res.body.pipe(writable);

            writable.on("finish", () => {
                emitter.emit('end');
            });

            writable.on("error", (err: any) => {
                emitter.emit('error', err);
            });
        })
        .catch((error: any) => {
            console.error(error);
            vscode.window.showErrorMessage("PromptRocket: There was an error while connecting to OpenAI API");
        });

    return emitter;
};

export async function preprocessMessages(messages: IMessage[]) {
    const language = await utils.getLanguageID();
    const context = await utils.getContext() || ['', '', ''];
    let newMessages: IMessage[] = [];

    messages.forEach((msg) => {
        let role = msg.role || "user";
        let hiddenContext = msg.hiddenContext || "";
        let content = msg.content || "";

        content = content.replace(/{{language}}/g, language);
        content = content.replace(/{{context_before}}/g, context[0]);
        content = content.replace(/{{selected_text}}/g, context[1]);
        content = content.replace(/{{context_after}}/g, context[2]);

        if (hiddenContext.length > 0) {
            hiddenContext = `Context: \`\`\`${hiddenContext}\`\`\`\n`;
        }

        const newMessage: IMessage = {
            role: role,
            hiddenContext: hiddenContext,
            content: content,
        };

        newMessages.push(newMessage);
    });

    return newMessages;
}