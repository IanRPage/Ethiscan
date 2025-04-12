// content.js

// This script scans the current webpage for Terms and Conditions content related to personal data usage.
// It looks for specific keywords and extracts relevant sections for analysis.

const keywords = [
    "privacy policy",
    "data usage",
    "data collection",
    "data sharing",
    "data selling",
    "data retention",
    "personal information",
    "user data"
];

// Function to extract text from elements that may contain Terms and Conditions
function extractTermsContent() {
    let bodyText = document.body.innerText.toLowerCase();
    let extractedSections = {
        collection: "",
        sharing: "",
        selling: "",
        retention: ""
    };

    // Check for keywords and extract relevant sections
    if (bodyText.includes("data collection")) {
        extractedSections.collection = extractSection(bodyText, "data collection");
    }
    if (bodyText.includes("data sharing")) {
        extractedSections.sharing = extractSection(bodyText, "data sharing");
    }
    if (bodyText.includes("data selling")) {
        extractedSections.selling = extractSection(bodyText, "data selling");
    }
    if (bodyText.includes("data retention")) {
        extractedSections.retention = extractSection(bodyText, "data retention");
    }

    return extractedSections;
}

// Function to extract a section of text based on a keyword
function extractSection(text, keyword) {
    const startIndex = text.indexOf(keyword);
    const endIndex = text.indexOf(".", startIndex) + 1; // Extract until the next period
    return text.substring(startIndex, endIndex).trim();
}

// Function to analyze the extracted sections and generate a summary
function analyzeDataUsage(sections) {
    let summary = {
        collection: sections.collection || "No information found.",
        sharing: sections.sharing || "No information found.",
        selling: sections.selling || "No information found.",
        retention: sections.retention || "No information found.",
        rating: "Moderate" // Default rating, can be adjusted based on content
    };

    // Simple logic to determine privacy rating based on content presence
    if (sections.collection && sections.sharing && sections.selling) {
        summary.rating = "Good";
    } else if (sections.collection || sections.sharing) {
        summary.rating = "Moderate";
    } else {
        summary.rating = "Poor";
    }

    return summary;
}

// Main function to execute the analysis
function main() {
    const extractedSections = extractTermsContent();
    const analysisResult = analyzeDataUsage(extractedSections);

    // Send the analysis result back to the background script or popup
    chrome.runtime.sendMessage({ action: "analysisResult", data: analysisResult });
}

// Execute the main function
main();