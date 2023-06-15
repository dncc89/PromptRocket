export interface ICommand {
    name: string;
    argument?: boolean;
    prompts?: IMessage[];
}

export interface IMessage {
    role?: string;
    name?: string;
    hiddenContext?: string;
    content?: string;
}

