import * as utils from "./utils";
import * as vscode from "vscode";

import { EventEmitter } from 'events';
import { IMessage } from './interfaces';
import { time } from "console";

const { TextDecoder } = require("util");
const { Writable } = require("stream");
const fetch = require("cross-fetch");

export const streamCompletion = (payload: any) => {
    const emitter = new EventEmitter();

    Promise.race([fetch("https://api.openai.com/v1/chat/completions", payload), timeout(5000)])
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

const timeout = (ms: number) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error("Request timed out"));
        }, ms);
    });
};

export const simpleCompletion = async (payload: any) => {
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", payload);

        if (!response.ok) {
            throw new Error(JSON.stringify(response));
        }

        const data = await response.json();
        const text = data.choices[0].message.function_call.arguments;
        return JSON.parse(text).text;
    } catch (error) {
        return error;
    }
};