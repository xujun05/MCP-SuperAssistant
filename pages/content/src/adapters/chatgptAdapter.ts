/**
 * ChatGPT Adapter
 *
 * This file implements the site adapter for chatgpt.com
 */

import { BaseAdapter } from './common';
import { logMessage } from '../utils/helpers';
import { insertToolResultToChatInput, attachFileToChatInput, submitChatInput } from '../components/websites/chatgpt';

// Debounce utility function
function debounce<F extends (...args: any[]) => void>(func: F, waitFor: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<F>): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      func(...args);
    }, waitFor);
  };
}
import { SidebarManager } from '../components/sidebar';
import { initChatGPTComponents } from './adaptercomponents';
export class ChatGptAdapter extends BaseAdapter {
  name = 'ChatGPT';
  hostname = ['chat.openai.com', 'chatgpt.com'];

  // Properties to track navigation
  private lastUrl: string = '';
  private urlCheckInterval: number | null = null;
  private messageObserver: MutationObserver | null = null; // For observing new AI messages
  private debouncedProcessAiMessage: ((messageElement: HTMLElement) => void) | null = null;
  private lastProcessedMessageContent: string | null = null; // For deduplication

  constructor() {
    super();
    // Create the sidebar manager instance
    this.sidebarManager = SidebarManager.getInstance('chatgpt');
    logMessage('Created ChatGPT sidebar manager instance');
    // Initialize the debounced function
    this.debouncedProcessAiMessage = debounce(this.processAndRelayAiMessage.bind(this), 750); // 750ms debounce delay
    // initChatGPTComponents();
  }

  protected initializeSidebarManager(): void {
    this.sidebarManager.initialize();
  }

  protected initializeObserver(forceReset: boolean = false): void {
    // super.initializeObserver(forceReset);
    initChatGPTComponents();

    // Start URL checking to handle navigation within AiStudio
    if (!this.urlCheckInterval) {
      this.lastUrl = window.location.href;
      this.urlCheckInterval = window.setInterval(() => {
        const currentUrl = window.location.href;

        if (currentUrl !== this.lastUrl) {
          logMessage(`URL changed from ${this.lastUrl} to ${currentUrl}`);
          this.lastUrl = currentUrl;
          this.lastProcessedMessageContent = null; // Reset deduplication cache on URL change

          initChatGPTComponents();
          // Check if we should show or hide the sidebar based on URL
          this.checkCurrentUrl();
        }
      }, 1000); // Check every second
    }

    // Initialize MutationObserver for new messages
    if (!this.messageObserver) {
      const conversationTurnsContainer = document.querySelector('main > div > div > div > div[class*="react-scroll-to-bottom"] > div > div');
      const targetNode = conversationTurnsContainer || document.querySelector('main');

      if (targetNode) {
        this.messageObserver = new MutationObserver(this.handleMutations.bind(this));
        this.messageObserver.observe(targetNode, {
          childList: true,
          subtree: true,
          characterData: true, // Observe text changes for streaming
          attributes: true, // Observe attribute changes (e.g. data-message-id)
          attributeFilter: ['data-message-id', 'class'], // Be specific if possible
        });
        logMessage('ChatGPT Adapter: MutationObserver initialized for new messages (childList, characterData, attributes).');
      } else {
        logMessage('ChatGPT Adapter: Could not find target node for MutationObserver. New message detection might not work.', 'error');
      }
    }
  }

  private processAndRelayAiMessage(messageElement: HTMLElement): void {
    if (!messageElement) return;

    const assistantMessageContainer = messageElement.querySelector('[data-message-author-role="assistant"]');
    if (!assistantMessageContainer) return;

    let currentMessageText = '';
    // Prioritize more specific selectors first
    const markdownProseElement = assistantMessageContainer.querySelector('.markdown.prose');
    if (markdownProseElement && markdownProseElement.textContent) {
      currentMessageText = markdownProseElement.textContent.trim();
    } else {
      const streamingContentElement = assistantMessageContainer.querySelector('div[class*="result-streaming"]');
      if (streamingContentElement && streamingContentElement.textContent) {
        currentMessageText = streamingContentElement.textContent.trim();
      } else if (assistantMessageContainer.textContent) {
        // Fallback to the entire assistant container's text content
        // This might sometimes include "ChatGPT" or other UI elements if not careful with structure
        currentMessageText = assistantMessageContainer.textContent.trim();
      }
    }
    
    // Further refinement: Sometimes the .markdown.prose is empty, but a sibling or child contains the actual text.
    // This check is a bit more aggressive if the primary selectors fail.
    if (!currentMessageText && assistantMessageContainer.children.length > 0) {
        // Attempt to get text from direct children, often in a div.
        // This can be risky if the structure is not as expected.
        for (const child of Array.from(assistantMessageContainer.children)) {
            if (child.textContent && child.textContent.trim().length > 0 && child.tagName.toLowerCase() === 'div') {
                 // Check if this child is not another message container or a button bar etc.
                if (!child.querySelector('[data-message-author-role]') && !child.querySelector('button')) {
                    currentMessageText = child.textContent.trim();
                    break; 
                }
            }
        }
    }


    if (currentMessageText && currentMessageText !== this.lastProcessedMessageContent) {
      if (this.newOutputListener) {
        logMessage('ChatGPT Adapter: Relaying message (debounced). Content: ' + currentMessageText.substring(0, 50) + '...');
        this.newOutputListener(currentMessageText);
        this.lastProcessedMessageContent = currentMessageText;
      }
    } else if (currentMessageText && currentMessageText === this.lastProcessedMessageContent) {
      // logMessage('ChatGPT Adapter: Message content identical to last processed, not relaying.');
    }
  }

  private handleMutations(mutationsList: MutationRecord[], observer: MutationObserver): void {
    for (const mutation of mutationsList) {
      let targetElement: HTMLElement | null = null;

      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            // Check if the added node itself is a turn or contains one
            if (element.matches('[data-testid*="conversation-turn"]')) {
              targetElement = element;
            } else {
              targetElement = element.querySelector('[data-testid*="conversation-turn"]');
            }
            if (targetElement && targetElement.querySelector('[data-message-author-role="assistant"]') && this.debouncedProcessAiMessage) {
              this.debouncedProcessAiMessage(targetElement);
            }
          }
        });
      } else if (mutation.type === 'characterData') {
        // Target for characterData is a Text node, get its parent.
        const parent = mutation.target.parentElement;
        if (parent) {
          targetElement = parent.closest('[data-testid*="conversation-turn"]');
        }
        if (targetElement && targetElement.querySelector('[data-message-author-role="assistant"]') && this.debouncedProcessAiMessage) {
          this.debouncedProcessAiMessage(targetElement);
        }
      } else if (mutation.type === 'attributes') {
        if (mutation.target.nodeType === Node.ELEMENT_NODE) {
          targetElement = (mutation.target as HTMLElement).closest('[data-testid*="conversation-turn"]');
        }
        if (targetElement && targetElement.querySelector('[data-message-author-role="assistant"]') && this.debouncedProcessAiMessage) {
          this.debouncedProcessAiMessage(targetElement);
        }
      }
    }
  }

  cleanup(): void {
    // Clear interval for URL checking
    if (this.urlCheckInterval) {
      window.clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }

    // Disconnect MutationObserver
    if (this.messageObserver) {
      this.messageObserver.disconnect();
      this.messageObserver = null;
      logMessage('ChatGPT Adapter: MutationObserver disconnected.');
    }

    // Call the parent cleanup method
    super.cleanup();
  }

  /**
   * Insert text into the ChatGPT input field
   * @param text Text to insert
   */
  insertTextIntoInput(text: string): void {
    insertToolResultToChatInput(text);
    logMessage(`Inserted text into ChatGPT input: ${text.substring(0, 20)}...`);
  }

  /**
   * Trigger submission of the ChatGPT input form
   */
  triggerSubmission(): void {
    // Use the function to submit the form
    submitChatInput()
      .then((success: boolean) => {
        logMessage(`Triggered ChatGPT form submission: ${success ? 'success' : 'failed'}`);
      })
      .catch((error: Error) => {
        logMessage(`Error triggering ChatGPT form submission: ${error}`);
      });
  }

  /**
   * Check if ChatGPT supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    return true;
  }

  /**
   * Attach a file to the ChatGPT input
   * @param file The file to attach
   * @returns Promise that resolves to true if successful
   */
  async attachFile(file: File): Promise<boolean> {
    try {
      const result = await attachFileToChatInput(file);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logMessage(`Error in adapter when attaching file to ChatGPT input: ${errorMessage}`);
      console.error('Error in adapter when attaching file to ChatGPT input:', error);
      return false;
    }
  }

  /**
   * Force a full document scan for tool commands
   * This is useful when we suspect tool commands might have been missed
   */
  public forceFullScan(): void {
    logMessage('Forcing full document scan for ChatGPT');
  }

  /**
   * Check the current URL and show/hide sidebar accordingly
   */
  private checkCurrentUrl(): void {
    const currentUrl = window.location.href;
    logMessage(`Checking current Chatgpt URL: ${currentUrl}`);

    // For AiStudio, we want to show the sidebar on all pages
    // You can customize this with specific URL patterns if needed
    if (this.sidebarManager && !this.sidebarManager.getIsVisible()) {
      logMessage('Showing sidebar for Chatgpt URL');
      this.sidebarManager.showWithToolOutputs();
    }
  }

  async getAiOutput(): Promise<string> {
    try {
      // Selector for all message turns in the conversation
      const messageElements = document.querySelectorAll('[data-testid*="conversation-turn"]');
      if (messageElements.length === 0) {
        logMessage('No conversation turns found for ChatGPT.');
        return '';
      }

      // Get the last message element
      const lastMessageElement = messageElements[messageElements.length - 1];

      // Selector for the AI's message content within a turn.
      // ChatGPT's structure has the AI response within a div with class 'markdown'
      // and often within a structure that includes `data-message-author-role="assistant"`
      // on one of its parent elements. We will try to find the actual content host.
      // A common pattern for AI messages is a div that contains the rendered markdown.
      // Let's try a selector that is more specific to AI responses.
      // First, check if the last message is from the assistant.
      // The actual text is within a div with class starting with "result-streaming" or similar for final messages.
      // Or inside a div with class "markdown prose"
      const assistantMessageSelector = '[data-message-author-role="assistant"]';
      const potentialAiMessageContainer = lastMessageElement.querySelector(assistantMessageSelector);

      if (potentialAiMessageContainer) {
        // If we found a container marked as 'assistant', look for the message content within it.
        // Common selectors for message content: '.markdown.prose', 'div[class*="result-streaming"]'
        let aiMessageContent = potentialAiMessageContainer.querySelector('.markdown.prose');
        if (aiMessageContent && aiMessageContent.textContent) {
          return aiMessageContent.textContent.trim();
        }
        // Fallback for potentially different structures or streaming messages
        aiMessageContent = potentialAiMessageContainer.querySelector('div[class*="result-streaming"]');
        if (aiMessageContent && aiMessageContent.textContent) {
          return aiMessageContent.textContent.trim();
        }
        // If specific content selectors fail, return the text content of the assistant message container
        if (potentialAiMessageContainer.textContent) {
          return potentialAiMessageContainer.textContent.trim();
        }
      } else {
        // If the last message is not explicitly marked as 'assistant' using the above selector,
        // it might be a user message or a system message.
        // We could try a more general approach if the above fails, but it risks picking up user messages.
        // For now, if it's not clearly an AI message, we return empty.
        logMessage('Last message element does not appear to be from the AI assistant.');
        return '';
      }

      // If no content was extracted from an assistant message
      logMessage('Could not extract AI message content from the last message element.');
      return '';

    } catch (error) {
      logMessage(`Error getting AI output from ChatGPT: ${error}`);
      console.error('Error getting AI output from ChatGPT:', error);
      return Promise.reject(new Error('Failed to get AI output from ChatGPT'));
    }
  }
}
