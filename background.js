// background.js

// Listen for messages from the popup script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "analyzePage") {
        console.log("Background script received analyzePage request.");

        // 1. Get the current active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                const missingTabError = 'No active tab found';
                console.error(missingTabError);
                sendResponse({ success: false, error: missingTabError });
                return;
            }
            const tabId = tabs[0].id;
            const tabUrl = tabs[0].url; // Get the URL for context if needed

            console.log(`Analyzing tab ID: ${tabId}, URL: ${tabUrl}`);

            // 2. Inject content script to extract text from the current page
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: extractTextFromPage,
            }, async (injectionResults) => {
                // Error handling for injection
                if (chrome.runtime.lastError) {
                    console.error("Script injection failed:", chrome.runtime.lastError.message);
                    sendResponse({ success: false, error: `Failed to inject script: ${chrome.runtime.lastError.message}` });
                    return;
                }
                if (!injectionResults || injectionResults.length === 0 || !injectionResults[0].result) {
                    console.error("Content script did not return text.");
                    sendResponse({ success: false, error: "Could not extract text from the page. Ensure you are on the ToS or Privacy Policy page." });
                    return;
                }

                const extractedResult = injectionResults[0].result;

                if (typeof extractedResult === 'object' && extractedResult.isRegistration) {
                    console.log("Registration page detected. Fetching privacy policy from:", extractedResult.privacyUrl);
                    try {
                        const privacyResponse = await fetch(extractedResult.privacyUrl);
                        if (!privacyResponse.ok) {
                            throw new Error(`Failed to fetch privacy policy: ${privacyResponse.statusText}`);
                        }
                        const extractedText = await privacyResponse.text();
                        console.log(`Fetched privacy policy text length: ${extractedText.length}`);
                        // Continue by sending the privacy policy text for analysis
                        console.log("Sending text to analysis function...");
                        const analysisResult = await analyzeTextWithGemini(extractedText);
                        console.log("Analysis successful:", analysisResult);
                        sendResponse({
                            success: true,
                            score: analysisResult.score,
                            summary: analysisResult.summary
                        });
                    } catch (fetchError) {
                        console.error("Error fetching privacy policy:", fetchError);
                        sendResponse({ success: false, error: fetchError.message });
                    }
                } else if (typeof extractedResult === 'string') {
                    // Continue with the original logic using the extracted text from the page
                    const extractedText = extractedResult;
                    console.log(`Extracted text length: ${extractedText.length}`);
                    if (extractedText.length < 100) {
                        console.warn("Extracted text seems too short.");
                    }
                    try {
                        console.log("Sending text to analysis function...");
                        const analysisResult = await analyzeTextWithGemini(extractedText);
                        console.log("Analysis successful:", analysisResult);
                        sendResponse({
                            success: true,
                            score: analysisResult.score,
                            summary: analysisResult.summary
                        });
                    } catch (error) {
                        console.error("Analysis failed:", error);
                        sendResponse({ success: false, error: error.message || "Failed to analyze text." });
                    }
                } else {
                    console.error("Content script returned unexpected type.");
                    sendResponse({ success: false, error: "Unexpected data format from content extraction." });
                }
            });
        });

        // Return true to indicate you wish to send a response asynchronously
        return true;
    }
});

console.log("Background service worker started.");

// Modify extractTextFromPage to detect registration pages and extract privacy policy link
function extractTextFromPage() {
    // Check for registration indicators (form, keywords)
    const formElement = document.querySelector('form[method="post"], form[action*="register"], form[action*="signup"], form[id*="register"], form[id*="signup"]');
    const bodyTextLower = document.body.innerText.toLowerCase();
    const isLikelyRegistration = formElement ||
                                 bodyTextLower.includes('create account') ||
                                 bodyTextLower.includes('sign up');

    if (isLikelyRegistration) {
        console.log("Ethiscan: Likely registration page detected.");
        let foundLink = null;
        const links = document.querySelectorAll('a');

        for (const link of links) {
            const linkText = link.innerText.toLowerCase();
            const linkHref = link.href.toLowerCase(); // href is already absolute

            // Prioritize links with "privacy policy" in text
            if (linkText.includes('privacy policy')) {
                foundLink = link;
                console.log("Ethiscan: Found 'privacy policy' text link:", foundLink.href);
                break; // Found the best match
            }
            // Fallback: check for "privacy" in text or href if no better match yet
            if (!foundLink && (linkText.includes('privacy') || linkHref.includes('privacy'))) {
                 foundLink = link;
                 console.log("Ethiscan: Found 'privacy' keyword link:", foundLink.href);
                 // Don't break yet, keep looking for a better "privacy policy" text match
            }
        }

        if (foundLink) {
            console.log("Ethiscan: Using privacy policy link:", foundLink.href);
            return {
                isRegistration: true,
                privacyUrl: foundLink.href // 'href' property gives the absolute URL
            };
        } else {
             console.log("Ethiscan: Likely registration page, but no suitable privacy link found. Analyzing current page text.");
             // Fall through to return body text if no link found
        }
    }
    // Fallback: return the full text from the page if not registration or no link found
    console.log("Ethiscan: Not detected as registration or no privacy link found, returning page text.");
    return document.body.innerText;
}

// Placeholder for API Key retrieval - replace with secure storage later
async function getApiKey() {
    // Retrieve the API key securely from chrome.storage.sync
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(['geminiApiKey'], (result) => {
            if (chrome.runtime.lastError) {
                // Handle potential errors during storage access
                console.error("Error retrieving API key:", chrome.runtime.lastError);
                return reject(new Error("Could not retrieve API key from storage."));
            }
            // Resolve the promise with the retrieved key (or undefined if not set)
            resolve(result.geminiApiKey);
        });
    });
}

async function parseGeneratedJSON(text) {
    // Parse the JSON string within the generated text
    try {
        // Attempt to clean potential markdown code block fences
        // Find the start and end of the JSON object within the text
        const startIndex = text.indexOf('{');
        const endIndex = text.lastIndexOf('}');

        if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
            console.error("Could not find valid JSON object boundaries in text:", text);
            throw new Error("Could not find JSON object in API response.");
        }

        // Extract the potential JSON string
        const jsonString = text.substring(startIndex, endIndex + 1);

        // Parse the extracted string
        const resultJson = JSON.parse(jsonString);

        if (typeof resultJson.score !== 'number' || typeof resultJson.summary !== 'string') {
            console.error("Parsed JSON does not match expected format:", resultJson);
            throw new Error("API response JSON format is incorrect.");
        }

        // console.log("Parsed analysis:", resultJson);
        return resultJson;

    } catch (parseError) {
        console.error("Failed to parse JSON from API response:", parseError, "Raw text:", text);
        throw new Error("Failed to parse analysis JSON from API response.");
    }

}

// Placeholder for Gemini API call
async function analyzeTextWithGemini(text) {
    const apiKey = await getApiKey();
    // console.log(apiKey);
    if (!apiKey) { // Check if the key is falsy (empty string, null, undefined)
        console.error("Gemini API Key not configured.");
        throw new Error("API Key not configured. Please set it in the extension options.");
    }

    // Define the Gemini API endpoint (using gemini-pro model)
    // Ensure your API key has access to this model.
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

    // Construct the prompt asking for JSON output
    const prompt = `This is how you will decide the score for the privacy policy. Treat this as a rubric. Treat every policy exactly the same.
You will be scoring the privacy policy based on the following categories. Each category has a different weight, and you will be scoring each category out of 5 points. The total score will be out of 5 points.

# Privacy Policy Evaluation Framework

## A. Data Collection Practices (25%)

### 5 points:
- Data collection strictly limited to functional necessity
- Each data element has specific, documented justification
- Non-essential data collection requires explicit opt-in consent
- No unnecessary persistent identifiers collected
- Third-party data integration absent or minimal with transparent disclosure

### 4 points:
- Data collection primarily limited to justified purposes
- Most data elements have specific rationale
- Clear opt-in/opt-out mechanisms for non-essential collection
- Limited third-party data integration with clear disclosure
- Reasonable collection scope with justification

### 3 points:
- Moderate collection with general justifications
- Data categories defined but somewhat broad
- Some opt-in/opt-out options but not comprehensive
- Moderate third-party data integration
- Some collection without strong justification

### 2 points:
- Extensive collection with vague justifications
- Broad data categories without specific rationale
- Limited user choice regarding collection
- Significant third-party data contribution
- Collection of sensitive data with minimal justification

### 1 point:
- Excessive collection without meaningful justification
- No clear limitations on collection scope
- Absence of user choice regarding collection
- Extensive third-party data harvesting
- Collection of sensitive data without necessity

### 0 points:
- Deceptive collection practices
- Collection scope deliberately obscured
- Collection exceeds stated purposes

## B. Data Usage Within Company (25%)

### 5 points:
- Usage strictly limited to providing explicitly requested services
- No secondary internal uses beyond core functionality
- No algorithmic profiling or automated decision-making
- Clear purpose limitation enforcement
- No data mining for unrelated purposes

### 4 points:
- Usage primarily for service provision with specific justifications
- Limited personalization with transparent explanation
- Minimal internal secondary uses with clear reasoning
- Privacy-preserving processing techniques employed
- Specific purpose statements for each use case

### 3 points:
- Moderate usage for service improvement and personalization
- Some internal use for product development
- Limited algorithmic profiling with disclosure
- Marketing use with consent mechanisms
- Somewhat broad purpose statements

### 2 points:
- Extensive usage across company services
- Significant algorithmic profiling
- Multiple secondary uses with general justifications
- Regular use for marketing purposes
- Broad purpose statements with little specificity

### 1 point:
- Usage for purposes well beyond service provision
- Extensive profiling with minimal transparency
- Broad internal usage across unrelated products
- Heavy marketing and advertising focus
- Purpose statements overly broad or vague

### 0 points:
- Deceptive usage practices
- Hidden processing purposes
- No meaningful purpose limitation

## C. Data Sharing With Third Parties (25%)

### 5 points:
- No sharing except for essential service providers with strict contractual controls
- No data selling under any circumstances
- Law enforcement requests require valid warrants/court orders
- Complete list of all service providers with roles
- No downstream use beyond providing contracted service

### 4 points:
- Limited sharing with necessary service providers
- No direct data selling
- Data shared with law enforcement only with valid orders
- Vendor contracts include strong data protection requirements
- Categories of service providers disclosed

### 3 points:
- Moderate sharing with service providers and analytics partners
- May share de-identified data with commercial partners
- Sharing with law enforcement follows legal requirements
- Basic vendor oversight mechanisms
- General disclosure of sharing recipients

### 2 points:
- Extensive sharing network including marketing partners
- May sell aggregated or de-identified data
- May share with government entities without requiring warrants
- Limited vendor restrictions
- Vague disclosure of sharing relationships

### 1 point:
- Unrestricted sharing with commercial partners
- Sells identifiable personal data
- Readily shares with government without legal process
- No meaningful vendor controls
- Minimal transparency regarding sharing recipients

### 0 points:
- Deceptive sharing practices
- Sharing relationships deliberately obscured
- No limitations on recipient usage

## D. User Control of Data (15%)

### 5 points:
- Complete data deletion upon request except where legally required retention
- Full suite of data rights (access, rectification, portability)
- Easily accessible self-service privacy controls
- Granular permissions for different data categories
- Specific retention periods for each data category
- Automated data deletion at end of retention period

### 4 points:
- Strong deletion rights with minimal exceptions
- Comprehensive rights implementation
- Clear request process for data actions
- Specific retention periods for most data categories
- Regular data purging procedures

### 3 points:
- Standard deletion rights with some exceptions
- Basic rights implementation
- Defined process for exercising rights
- General retention periods
- Some data purging practices

### 2 points:
- Limited deletion rights with numerous exceptions
- Minimal rights recognition
- Complex process for exercising rights
- Vague retention timeframes
- Limited data purging evidence

### 1 point:
- Highly restricted deletion rights
- Few recognized user rights
- Burdensome rights exercise procedures
- Excessive or undefined retention periods
- No regular purging practices

### 0 points:
- No meaningful deletion rights
- Rights deliberately obstructed
- Indefinite data retention as default

## E. Policy Clarity (10%)

### 5 points:
- Clear, concise language at 8th-grade reading level or below
- Logical organization with intuitive navigation
- Visual elements to enhance understanding
- Examples illustrating data practices
- No legal jargon without plain language explanation
- Layered policy with summaries and details
- Version history with highlighted changes

### 4 points:
- Clear language with minimal jargon
- Well-structured document
- Some visual aids or examples
- Key terms clearly defined
- Easy navigation between sections

### 3 points:
- Generally understandable language
- Organized structure
- Limited jargon
- Basic definitions provided
- Reasonable length

### 2 points:
- Somewhat complex language
- Dense text with minimal organization
- Some unexplained legal terminology
- Few clarifying examples
- Excessive length

### 1 point:
- Complex legal language
- Poor organization
- Excessive jargon
- No examples or clarifications
- Unnecessarily verbose

### 0 points:
- Deliberately obfuscated language
- Contradictory statements
- Unnavigable structure

## Scoring Formula

Final Score = (A * 0.25) + (B * 0.25) + (C * 0.25) + (D * 0.15) + (E * 0.10)

## Privacy Policy Rating Scale

### Exceptional (4.5-5.0):
Industry-leading privacy practices with user interests prioritized

### Excellent (4.0-4.4):
Strong privacy practices exceeding regulatory requirements

### Good (3.5-3.9):
Solid privacy practices above industry average

### Adequate (3.0-3.4):
Satisfactory privacy practices meeting basic expectations

### Concerning (2.0-2.9):
Problematic privacy practices with significant issues

### Poor (1.0-1.9):
Inadequate privacy protections with serious concerns

### Unacceptable (0.0-0.9):
Fundamentally flawed privacy practices

Provide ONLY a JSON object with the keys "score" (numerical value 1-5) and "summary" (1-2 paragraph text). Do not include any other text or markdown formatting.

     JSON object:\n\nDocument Text:\n${text};`;

    console.log("Calling Gemini API...");

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                // Gemini API structure
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                // Optional: Add safety settings if needed
                // safetySettings: [ ... ],
                // Optional: Configure generation parameters
                // generationConfig: { ... }
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("Gemini API Error Response:", errorBody);
            throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Extract the generated text containing the JSON
        // Structure might vary slightly based on API version/settings
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0] || !data.candidates[0].content.parts[0].text) {
            console.error("Unexpected API response structure:", data);
            throw new Error("Could not parse analysis from API response.");
        }

        const rawGeneratedText = data.candidates[0].content.parts[0].text;

        return parseGeneratedJSON(rawGeneratedText);

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        // Rethrow a user-friendly error message
        throw new Error(`Failed to get analysis from AI: ${error.message}`);
    }
}