const vscode = acquireVsCodeApi(); // Add this line to define the vscode object
const messageList = document.getElementById('message-list');
const outputContainer = document.getElementById('output-container');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const modelDropdown = document.getElementById('model-select');
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
let selectionButtonContainer = null;

// Requst messages to populate on view reset
viewInitialized();
userInput.focus();

// Marked override 
marked.use({ mangle: false, headerIds: false });
const renderer = new marked.Renderer();
renderer.code = (code, language) => {
    const escapedCode = escapeHtml(code);
    vscode.postMessage({ command: 'updateCodeblockBuffer', text: code });

    const buttonId1 = 'copyToClipboardButton' + '_' + generateUUID();
    const buttonId2 = 'replaceSelectedTextButton' + '_' + generateUUID();

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
                button.innerHTML = '<i class="fas fa-check"></i>';
                button.innerHTML = '<i class="fas fa-check"></i>';
            } else if (action === 'replaceSelectedTextButton') {
                replaceSelectedText(escapedCode);
            }
        });
    });
}

function initTextSelectionButton() {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'text-button-container';
    buttonContainer.style.display = 'none';
    document.body.appendChild(buttonContainer);

    // Add copyToClipboardButton
    const copyToClipboardButton = document.createElement('button');
    copyToClipboardButton.className = 'button-icon';
    copyToClipboardButton.id = 'copyToClipboardButton';
    copyToClipboardButton.innerHTML = '<i class="fa-regular fa-clipboard"></i>';

    copyToClipboardButton.addEventListener('click', () => {
        copyToClipboard(getSelectedText());
    });

    buttonContainer.appendChild(copyToClipboardButton);

    // Add replaceSelectedTextButton
    const replaceSelectedTextButton = document.createElement('button');
    replaceSelectedTextButton.className = 'button-icon';
    replaceSelectedTextButton.id = 'replaceSelectedTextButton';
    replaceSelectedTextButton.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket"></i>';

    replaceSelectedTextButton.addEventListener('click', () => {
        replaceSelectedText(getSelectedText());
    });

    buttonContainer.appendChild(replaceSelectedTextButton);
}
initTextSelectionButton();

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
            // displayMessage(userInput.value, isUserMessage = true);
            vscode.postMessage({
                command: 'userMessage',
                id: messages.length,
                text: userInput.value
            });
            userInput.value = '';
        }
    }
});

modelDropdown.addEventListener('change', function (event) {
    const selectedModel = modelDropdown.options[modelDropdown.selectedIndex].text;
    vscode.postMessage({ command: 'changeModel', text: selectedModel });
});

window.addEventListener('message', handleMessage);
window.addEventListener('blur', function () {
    document.body.classList.add('inactive-selection');
});
window.addEventListener('focus', function () {
    document.body.classList.remove('inactive-selection');
});
document.addEventListener('mouseup', debounce(showButtonsOnSelectedText), 250);

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
        case 'focusInputBox':
            userInput.focus();
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
                displayMessage(message.text, message.isUserMessage, message.isNewMessage, false);
            }
            updateTextareaState();
            break;
        case 'populateMessage':
            displayMessage(message.text, message.isUserMessage, false, message.isSystemMessage);
            currentWrapper = null;
            currentText = '';
            break;
        case 'setModel':
            // setModelName(message.text);
            break;
    }
    bindCodeButtonEvents();
}


function displayMessage(text, isUserMessage, isNewMessage = false, isSystemMessage = false) {
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
        let systemIcon = document.createElement('span');
        systemIcon.classList.add('fa-solid', 'fa-wand-magic-sparkles', 'margin-right-5');

        if (isSystemMessage) {
            sender.appendChild(systemIcon);
        }
        else {
            sender.appendChild(isUserMessage ? userIcon : assistantIcon);
        }
        sender.appendChild(usernameText);
        currentWrapper.appendChild(sender);
        messageList.appendChild(currentWrapper);
        //append new one to message
        id = messages.push(document.createElement('div')) - 1;
        wrappers.push(currentWrapper);
        messages[id].className = isUserMessage ? 'user-message' : 'assistant-message';

        if (isSystemMessage) {
            usernameText.textContent += ' (system)';
            sender.classList.add('system-message', 'system-message-fade');
            messages[id].classList.add('system-message', 'system-message-fade');
        }
    }

    currentText += text;
    if (isUserMessage) {
        messages[id].textContent = currentText;
    }
    else {
        messages[id].innerHTML = marked.parse(currentText, { renderer });
    }

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
    vscode.postMessage({
        command: 'viewInitialized'
    });
    bindCodeButtonEvents();
}
function escapeHtml(html) {
    return html
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showButtonsOnSelectedText(event) {
    const selectedText = getSelectedText();
    const buttonContainer = document.querySelector('.text-button-container');

    if (selectedText) {
        // Update button container's position and content
        updateButtonContainerPosition(event, buttonContainer);
        buttonContainer.style.display = 'flex';
    } else {
        // Hide button container if no text is selected
        buttonContainer.style.display = 'none';
    }
}

function updateButtonContainerPosition(event, buttonContainer) {
    const selection = window.getSelection();
    const rects = selection.getRangeAt(0).getClientRects();
    let topMost = Number.POSITIVE_INFINITY;
    let rightMost = Number.NEGATIVE_INFINITY;

    for (const rect of rects) {
        topMost = Math.min(topMost, rect.top);
        rightMost = Math.max(rightMost, rect.right);
    }

    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    const buttonContainerHeight = 35;
    const buttonContainerWidth = 80;
    const adjustedTop = Math.min(topMost - buttonContainerHeight, windowHeight - buttonContainerHeight);
    const adjustedLeft = Math.min(rightMost, windowWidth - buttonContainerWidth);
    buttonContainer.style.top = `${adjustedTop}px`;
    buttonContainer.style.left = `${adjustedLeft}px`;
}

function getSelectedText() {
    let selectedText = '';
    const excludedElement = document.querySelector('.inputbox');

    if (excludedElement && document.activeElement === excludedElement) {
        return selectedText;
    }

    if (window.getSelection) {
        selectedText = window.getSelection().toString();
    } else if (document.selection && document.selection.type !== 'Control') {
        selectedText = document.selection.createRange().text;
    }
    return selectedText;
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

function setModelName(modelName) {
    modelDropdown.textContent = modelName;
}

