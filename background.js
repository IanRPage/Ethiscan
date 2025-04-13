// background.js

// Listen for messages from the popup script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "analyzePage") {
        console.log("Background script received analyzePage request.");

        // 1. Get the current active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                missingTabError = 'No active tab found';
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

                const extractedText = injectionResults[0].result;
                console.log(`Extracted text length: ${extractedText.length}`);
                if (extractedText.length < 100) { // Basic check for meaningful content
                    console.warn("Extracted text seems too short.");
                    // Optional: Send a warning back, or proceed anyway
                    // sendResponse({ success: false, error: "Extracted text is very short. Is this the correct page?" });
                    // return;
                }


                try {
                    // 3. Send extracted text to Gemini API (using placeholder function for now)
                    console.log("Sending text to analysis function...");
                    const analysisResult = await analyzeTextWithGemini(extractedText);

                    // 4. Process API response & 5. Send results back to popup
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
            });
        });

        // Return true to indicate you wish to send a response asynchronously
        return true;
    }
});

console.log("Background service worker started.");

// This function will be injected into the active tab
function extractTextFromPage() {
    // Simple extraction: get all text from the body
    // More sophisticated extraction could target specific elements,
    // remove boilerplate (headers/footers), or handle SPAs better.
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
        return resultJson; // { score: number, summary: string }

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
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // Construct the prompt asking for JSON output
    const prompt = `
This is how you will decide the score for the privacy policy. Treat this as a rubric. Treat every policy exactly the same.
You will be scoring the privacy policy based on the following categories. Each category has a different weight, and you will be scoring each category out of 5 points. The total score will be out of 5 points.

To calculate a score:
.25(Category A Data Collection practices) + .25(Category B Data Usage within company) +.25(Category C Data sharing with 3rd parties) + .15(Category D User Control of data) + .10(Category E Policy Clarity)

This is where the Rubric begins:
Data Collection practices: 25%
5 points: 
Data collection is limited to what is necessary. Each piece of data collected has a reason. Data collected that doesn’t have a functional reason is optional. 
4 points:
Data collection is moderate, with some justification. Data collected has some amount of reasoning, but it is not always specific. Some opt-in/opt-out options are available. 
Collects/receives minimal data from third-parties to contribute to your profile, and it is justified in a reasonable way. 
2-3 points:
Excessive data collection with some justification. Some clarity about what is being collected and why, but the categories and reasons are broad and/or non-specific. There are few and/or no opt-out options, and some collection is sensitive data is done without much reason. 
Collects/receives data from third-parties to contribute to your profile.
0-1 points:
Excessive Data collection with little to no justification. It is not clear what is being collected or why. There are little to no options for opting out of data collection. Sensitive data is unnecessarily collected and/or stored. 
Collects/receives significant data from third-parties to contribute to your profile.

B. Data Usage within company: 25 %
5 points:
Data usage within the company and its systems is minimal. If it is used, it is done minimally and to improve services and/or for other justifiable reasons. 
4 points:
Data usage within the company and its systems is moderate. It is used to improve and/or personalize services provided. Each reason is justified with specific reasoning. 
2-3 points:
Data usage within the company and its systems is excessive. It is used to improve and personalize services provided. However, the reason is not always justified with specific reasoning. Additionally, this data can be used for marketing and/or advertising. 
0-1 points:
Data usage within the company and its systems is excessive. It is used to improve and personalize services provided. The reasoning is often not justified with specific reasoning. Additionally, this data can/will be used for marketing and/or advertising. 

C. Data sharing with 3rd parties: 25%
5 points:
Data not shared with third-party partners. The only exception is law enforcement and/or local, state, or federal government requests with proof of a valid warrant or court order. 
4 points:
Data is shared with third-party partners for advertisements and analytics. The company does not selling your information to third-parties, but may share it for free. There is some amount of user option to opt out of this. 
Data is not shared with law enforcement and/or local, state, or federal government requests without proof of a valid warrant or court order. 
2-3 points:
Data is shared with third-party partners for advertisements, analytics. The company may by selling your information to third-parties. There is some amount of user option to opt out of this. 
Data may be shared with law enforcement and/or local, state, or federal government requests without proof of a valid warrant or court order. 
0-1 points:
Data is shared with third-party partners for advertisements, analytics. The company profits by selling your information to third-parties. There is no option for the user to opt out of this. 
Data is shared with law enforcement and/or local, state, or federal government requests without proof of a valid warrant or court order. 

D. User Control of data: 15%
5 points:
Only necessary data is kept. Only data that is required for functionality is kept. The only exceptions for this are:-Data required to be kept to comply with laws, regulations, government requests, or law enforcements requests, including but not limited to warrants and/or court orders. 
4 points:
Most of the data kept is necessary to the functionality of the application. Some extra information is kept, but it is reasonably justified and a strict timeline on how long that data is kept is in place. 
Data that must be kept:-Data required to be kept to comply with laws, regulations, government requests, or law enforcements requests, including but not limited to warrants and/or court orders.
2-3 points:
Data beyond what is necessary is kept. Some of the data collection may be justified, and timelines are set for how long the data is kept. However, those timelines may be excessive beyond what is necessary. 
Data that must be kept:-Data required to be kept to comply with laws, regulations, government requests, or law enforcements requests, including but not limited to warrants and/or court orders.
0-1 points:
Data beyond what is necessary is kept. The data collection is often not justified, and timelines may not be set for how long the data is kept. If there are timelines, they may be excessive beyond what is necessary. 
Data that must be kept:-Data required to be kept to comply with laws, regulations, government requests, or law enforcements requests, including but not limited to warrants and/or court orders.

E. Policy Clarity: 10%
You must analyze the policy itself. Just because the privacy policy or terms and conditions state that it is simple, clear, concise, or readable does not mean it actually is. 
5 points:
Policy is clear, concise, and readable. 
3 points:
Policy is somewhat clear, concise, and easily readable. 
1 point:
Policy is not clear, concise, and easily readable.
Rubric END.

Provide ONLY a JSON object with the keys "score" (numerical value 1-5) and "summary" (1-2 paragraph text). Do not include any other text or markdown formatting.

     JSON object:\n\nDocument Text:\n${text}`;

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