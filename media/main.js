const vscode = acquireVsCodeApi(); // Add this line to define the vscode object
const messageList = document.getElementById('message-list');
const outputContainer = document.getElementById('output-container');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const thinkingTexts = ['Thinking.', 'Thinking..', 'Thinking...', 'Thinking....', 'Thinking.....'];
let inputPlaceholder = '';
let counter = 0;
let username = 'User';
let assistantname = 'Assistant';
let currentWrapper = null;
let currentText = '';
let messages = [];
let wrappers = [];
let isStreaming = false;

// Requst messages to populate on view reset
viewInitialized();
userInput.focus();

// Marked override 
marked.use({ mangle: false, headerIds: false });
const renderer = new marked.Renderer();
renderer.code = (code, language) => {
    const escapedCode = escapeHtml(code);
    vscode.postMessage({ command: 'updateCodeblockBuffer', text: code });

    const buttonId1 = 'copyToClipboardButton' + '_' + Date.now();
    const buttonId2 = 'replaceSelectedTextButton' + '_' + Date.now();

    return `
    <div id="code-wrapper">
        <div class="codeblock-header">
            <div class="codeblock-icon">
                <i class="margin-left-5 fa-solid fa-code"></i>
                <span>${language || 'code'}</span>
            </div>
            <button class="button-icon margin-left-auto" id="${buttonId1}" data-code="${escapedCode}">
                <i class="fa-regular fa-clipboard"></i>
            </button>
            <button class="button-icon" id="${buttonId2}" data-code="${escapedCode}">
                <i class="fa-solid fa-arrow-right-from-bracket"></i> 
            </button>
        </div>
        <pre><code>${escapedCode}</code></pre>
    </div>
  `;
};

function bindCodeButtonEvents() {
    document.querySelectorAll('.button-icon').forEach(button => {
        const action = button.id.split('_')[0];
        const escapedCode = button.getAttribute('data-code');

        button.addEventListener('click', () => {
            if (action === 'copyToClipboardButton') {
                copyToClipboard(escapedCode);
            } else if (action === 'replaceSelectedTextButton') {
                replaceSelectedText(escapedCode);
            }
        });
    });
}

const loadingInterval = setInterval(() => {
    inputPlaceholder = thinkingTexts[counter % thinkingTexts.length];
    if (counter > 10) { counter = 0; }
    counter++;
}, 300);

sendButton.addEventListener('click', () => {
    if (isStreaming) {
        handleMessage({ data: { command: 'chatMessage', isCompletionEnd: true } });
        vscode.postMessage({ command: 'cancelStreaming' });
    }
    else {
        if (userInput.value) {
            displayMessage(userInput.value, isUserMessage = true);
            vscode.postMessage({
                command: 'userMessage',
                id: messages.length,
                text: userInput.value
            });
            userInput.value = '';
        }
    }
});

window.addEventListener('message', handleMessage);

textAreaResize(userInput);
userInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        userInput.value += "\n";
    }
    else if (event.key === "Enter") {
        event.preventDefault();
        sendButton.click();
        userInput.value = "";
    }
    textAreaResize(userInput);
});

function textAreaResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';
}
function handleMessage(event) {
    const message = event.data;
    switch (message.command) {
        case 'setUserName':
            username = message.name;
            break;
        case 'setAssistantName':
            assistantname = message.name;
            break;
        case 'chatMessage':
            if (message.isNewMessage && !message.isUserMessage) {
                isStreaming = true;
            }

            if (message.isCompletionEnd) {
                isStreaming = false;
                currentWrapper = null;  // close the current wrapper
                currentText = '';
            } else {
                displayMessage(message.text, message.isUserMessage, message.isNewMessage);
            }

            updateTextareaState();
            break;
        case 'populateMessage':
            displayMessage(message.text, message.isUserMessage);
            currentWrapper = null;
            currentText = '';
    }
}


function displayMessage(text, isUserMessage, isNewMessage = false) {
    if (isUserMessage || isNewMessage || !currentWrapper) {
        currentWrapper = document.createElement('div');
        currentWrapper.className = isUserMessage ? 'user-message-wrapper' : 'assistant-message-wrapper';
        currentWrapper.textContent = ' ';

        // Sender
        let sender = document.createElement('div');
        sender.className = isUserMessage ? 'sender-user' : 'sender-assistant';
        let usernameText = document.createElement('span');
        usernameText.textContent = isUserMessage ? username : assistantname;
        let userIcon = document.createElement('span');
        userIcon.classList.add('fa-regular', 'fa-user', 'margin-right-5');
        let assistantIcon = document.createElement('span');
        assistantIcon.classList.add('fa-solid', 'fa-user-astronaut', 'margin-right-5');

        sender.appendChild(isUserMessage ? userIcon : assistantIcon);
        sender.appendChild(usernameText);
        currentWrapper.appendChild(sender);
        messageList.appendChild(currentWrapper);
        //append new one to message
        id = messages.push(document.createElement('div')) - 1;
        wrappers.push(currentWrapper);
        messages[id].className = isUserMessage ? 'user-message' : 'extension-message';
    }

    currentText += text;
    if (isUserMessage)
        messages[id].textContent = currentText;
    else
        messages[id].innerHTML = marked.parse(currentText, { renderer });

    bindCodeButtonEvents();
    currentWrapper.appendChild(messages[id]);

    // clickable message
    if (isUserMessage) {
        let messageId = id;
        let wrapper = currentWrapper;
        let enterPressed = false;

        messages[id].addEventListener('click', function () {
            let originalMessage = messages[messageId].textContent; // Use messageId instead of id
            let textarea = document.createElement('textarea');
            textarea.id = 'user-input-fix';
            textarea.className = 'inputbox';
            textarea.value = originalMessage;
            textarea.rows = '1';
            messages[messageId].replaceWith(textarea);
            textarea.focus();
            textAreaResize(textarea);

            textarea.addEventListener('keypress', function (event) {
                textAreaResize(textarea);
                if (event.key === 'Enter') {
                    event.preventDefault();
                    enterPressed = true;
                    let newMessage = textarea.value;
                    messages[messageId].textContent = newMessage;
                    textarea.replaceWith(messages[messageId]);

                    // Remove and pop messages' parent after this one
                    for (let i = messages.length; i > messageId; i--) {
                        if (wrappers[i]) {
                            wrappers[i].remove();
                            wrappers.pop();
                            messages.pop();
                        }
                    }

                    vscode.postMessage({
                        id: messages.length,
                        command: 'userMessage',
                        text: newMessage
                    });
                }
            });
            textarea.addEventListener('blur', function (event) {
                event.preventDefault();
                if (!enterPressed) {
                    textarea.replaceWith(messages[messageId]);
                }
            });
        });
    }

    // Close the wrapper if it's a user message
    if (isUserMessage) {
        currentWrapper = null;
        currentText = '';
    }

    // Auto scroll
    outputContainer.scrollTop = outputContainer.scrollHeight;
}



function updateTextareaState() {
    if (isStreaming) {
        userInput.disabled = true;
        userInput.placeholder = inputPlaceholder;
        sendButton.innerHTML = "<i class='fa-regular fa-square'></i>";
    }
    else {
        userInput.disabled = false;
        userInput.placeholder = 'What\'s on your mind?';
        sendButton.innerHTML = "<i class='fa-regular fa-paper-plane'></i>";
    }
}

function copyToClipboard(text) {
    let msg = {
        command: 'copyToClipboard',
        text: text
    };
    vscode.postMessage(msg);
}

function replaceSelectedText(text) {
    let msg = {
        command: 'replaceSelectedText',
        text: text
    };
    vscode.postMessage(msg);
}

function viewInitialized() {
    console.log('view initialized');
    vscode.postMessage({
        command: 'viewInitialized'
    });
}
function escapeHtml(html) {
    return html
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeQuotes(str) {
    return str.replace(/"/g, '\\"').replace(/'/g, "\\'");
}

// Example of `anotherFunction` - you can replace this with your desired function
function anotherFunction(input) {
    console.log(input);
}