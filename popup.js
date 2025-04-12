// popup.js

// Function to initialize the popup UI
document.addEventListener('DOMContentLoaded', function() {
    // Get the analyze button and results container
    const analyzeButton = document.getElementById('analyze-button');
    const resultsContainer = document.getElementById('results-container');

    // Load the most recent analysis from storage
    chrome.storage.local.get(['lastAnalysis'], function(result) {
        if (result.lastAnalysis) {
            displayResults(result.lastAnalysis);
        }
    });

    // Add click event listener to the analyze button
    analyzeButton.addEventListener('click', function() {
        // Send a message to the content script to analyze the current page
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'analyze' }, function(response) {
                if (response) {
                    // Store the analysis result in local storage
                    chrome.storage.local.set({ lastAnalysis: response });
                    // Display the results
                    displayResults(response);
                } else {
                    resultsContainer.innerHTML = 'No Terms and Conditions found on this page.';
                }
            });
        });
    });
});

// Function to display the analysis results in the popup
function displayResults(analysis) {
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = '';

    // Create elements for each category of the analysis
    for (const category in analysis) {
        const categoryDiv = document.createElement('div');
        categoryDiv.classList.add('category');

        const title = document.createElement('h3');
        title.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        categoryDiv.appendChild(title);

        const summary = document.createElement('p');
        summary.textContent = analysis[category].summary;
        categoryDiv.appendChild(summary);

        const detailButton = document.createElement('button');
        detailButton.textContent = 'View Details';
        detailButton.addEventListener('click', function() {
            alert(analysis[category].details);
        });
        categoryDiv.appendChild(detailButton);

        resultsContainer.appendChild(categoryDiv);
    }

    // Display overall privacy rating
    const ratingDiv = document.createElement('div');
    ratingDiv.classList.add('rating');
    ratingDiv.textContent = `Overall Privacy Rating: ${analysis.rating}`;
    resultsContainer.appendChild(ratingDiv);
}