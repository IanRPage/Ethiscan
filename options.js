// options.js

// Saves options to chrome.storage.sync.
function saveOptions() {
    const apiKey = document.getElementById('apiKey').value;
    const status = document.getElementById('status');

    chrome.storage.sync.set({
        geminiApiKey: apiKey
    }, function() {
        // Update status to let user know options were saved.
        status.textContent = 'API Key saved.';
        status.style.color = 'green';
        setTimeout(function() {
            status.textContent = '';
        }, 1500); // Clear status after 1.5 seconds
    });
}

// Restores API key state using the preferences stored in chrome.storage.
function restoreOptions() {
    // Use default value apiKey = ''
    chrome.storage.sync.get({
        geminiApiKey: '' // Default to empty string if not set
    }, function(items) {
        document.getElementById('apiKey').value = items.geminiApiKey;
    });
}

// Add event listeners once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveButton').addEventListener('click', saveOptions);