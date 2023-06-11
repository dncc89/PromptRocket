export interface ICommand {
    name: string;
    argument?: boolean;
    prompts?: IMessage[];
}

export interface IMessage {
    role?: 'system' | 'user' | 'assistant';
    hiddenContext?: string;
    content?: string;
}

