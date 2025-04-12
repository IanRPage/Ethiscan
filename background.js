// background.js

// This script runs in the background and manages events for the Ethiscan extension.
// It listens for messages from the popup and content scripts, handling tasks such as storing the analysis results.

chrome.runtime.onInstalled.addListener(() => {
    // Initialize storage when the extension is installed
    chrome.storage.local.set({ analysisResults: {} });
});

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "storeAnalysis") {
        // Store the analysis results in local storage
        chrome.storage.local.set({ analysisResults: request.data }, () => {
            sendResponse({ status: "success" });
        });
        return true; // Indicates that the response will be sent asynchronously
    } else if (request.action === "getAnalysis") {
        // Retrieve the most recent analysis results
        chrome.storage.local.get("analysisResults", (data) => {
            sendResponse({ results: data.analysisResults });
        });
        return true; // Indicates that the response will be sent asynchronously
    }
});