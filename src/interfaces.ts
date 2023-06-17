export interface ICommandTemplate {
    name: string;
    argument?: boolean;
    prompts?: IMessage[];
}

export interface IMessageTemplate {
    name: string;
    argument?: boolean;
    prompt: string;
}

export interface IMessage {
    role?: string;
    name?: string;
    hiddenContext?: string;
    content?: string;
}

