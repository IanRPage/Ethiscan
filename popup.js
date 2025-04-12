document.addEventListener('DOMContentLoaded', function() {
    const analyzeButton = document.getElementById('analyzeButton');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultsDiv = document.getElementById('results');
    const errorDiv = document.getElementById('error');
    const ethicsScoreSpan = document.getElementById('ethicsScore');
    const analysisSummaryP = document.getElementById('analysisSummary');

    analyzeButton.addEventListener('click', () => {
        console.log('Analyze button clicked'); // Placeholder for actual logic
        // Hide previous results/errors and show loading indicator
        resultsDiv.style.display = 'none';
        errorDiv.style.display = 'none';
        loadingIndicator.style.display = 'block';
        analyzeButton.disabled = true; // Disable button during analysis

        // Send message to background script to start analysis
        chrome.runtime.sendMessage({ action: "analyzePage" }, (response) => {
            loadingIndicator.style.display = 'none';
            analyzeButton.disabled = false; // Re-enable button

            if (chrome.runtime.lastError) {
                // Handle errors like the background script not being available
                console.error("Error sending message:", chrome.runtime.lastError.message);
                showError(`Communication error: ${chrome.runtime.lastError.message}`);
                return;
            }

            if (response && response.success) {
                ethicsScoreSpan.textContent = response.score;
                analysisSummaryP.textContent = response.summary;
                resultsDiv.style.display = 'block';
                errorDiv.style.display = 'none'; // Hide error div on success
            } else {
                // Handle errors reported by the background script
                console.error("Analysis failed:", response ? response.error : "Unknown error");
                showError(response ? response.error : "An unknown error occurred during analysis.");
            }
        });
    });

    function showError(message) {
        errorDiv.textContent = `Error: ${message}`;
        errorDiv.style.display = 'block';
        resultsDiv.style.display = 'none';
        loadingIndicator.style.display = 'none';
        analyzeButton.disabled = false;
    }

    // Response from background script is handled in the sendMessage callback above
});