/**
 * M&E Toolkit Google Apps Script Backend (Revised for Modular JSON Forms)
 * Handles receiving form data and appending it to the correct Google Sheet tab.
 */

// --- Web App Entry Points ---

function doGet(e) {
  // Simple response to check if the script is live
  return ContentService.createTextOutput("M&E Toolkit Web App is Live. (v2 - JSON forms support)");
}

/**
 * doPost: Handles POST requests containing form submissions.
 * Expected incoming JSON structure in e.postData.contents:
 * {
 *   "submissions": [
 *     {
 *       "id": "localSubmissionId-xyz",      // Client-generated unique ID for the submission
 *       "formId": "health",                 // Corresponds to keys in FORM_DEFINITIONS in config.js
 *       "formTitle": "Health Monitoring Form", // For logging/reference
 *       "sheetName": "Health",              // Target Google Sheet tab name
 *       "payload": {                        // The actual form data
 *         "facilityName": "Juba Hospital",
 *         "reportingDate": "2023-10-26",
 *         // ... other fields as defined in the specific form's JSON
 *       },
 *       "submittedAt": "ISO_timestamp_string" // Timestamp from client
 *     },
 *     // ... potentially more submissions if batching is robustly implemented on client
 *   ]
 * }
 */
function doPost(e) {
  let response = {
    status: "error",
    message: "An unknown error occurred.",
    successfullySyncedIds: [] // To send back IDs of successfully processed submissions
  };

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No data received in POST request.");
    }

    // Log the raw request body for debugging (optional, remove in production for sensitive data)
    // Logger.log("Received POST data: " + e.postData.contents.substring(0, 500) + "...");

    const requestData = JSON.parse(e.postData.contents);

    if (!requestData.submissions || !Array.isArray(requestData.submissions) || requestData.submissions.length === 0) {
      throw new Error("Invalid or empty 'submissions' array in the request body.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet(); // Assumes script is bound to the target spreadsheet
    if (!ss) {
      throw new Error("Could not access the active spreadsheet. Ensure the script is bound correctly.");
    }

    let errorsEncountered = [];

    requestData.submissions.forEach(submission => {
      try {
        if (!submission.sheetName || !submission.payload || typeof submission.payload !== 'object') {
          throw new Error(`Invalid submission data for ID ${submission.id}: Missing sheetName or payload.`);
        }
        if (!submission.id) {
            throw new Error(`Submission missing 'id' field. Form: ${submission.formTitle || submission.formId}`);
        }


        let sheet = ss.getSheetByName(submission.sheetName);
        if (!sheet) {
          // Optional: Create sheet if it doesn't exist.
          // For this version, we'll assume sheets are pre-created by setupSheets().
          throw new Error(`Sheet named "${submission.sheetName}" not found. Please run setupSheets() or create it manually with headers.`);
        }

        // Get headers from the sheet (1st row)
        // Ensure there's at least one column before trying to get range.
        if (sheet.getLastColumn() === 0) { // Sheet is completely empty
             sheet.appendRow(Object.keys(submission.payload)); // Create header from first submission
             SpreadsheetApp.flush(); // ensure header is written before proceeding
        }
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        
        if (!headers || headers.filter(String).length === 0) { // Check if headers are effectively empty
          // If sheet was empty and we just added headers from payload, this check might be too strict.
          // A better approach is to ensure setupSheets() is run.
          // For now, if headers are still empty, we assume the first submission's keys are the headers.
          // This is a fallback, ideally setupSheets() handles this.
          if (sheet.getLastRow() === 0 || (sheet.getLastRow() === 1 && headers.filter(String).length === 0) ) {
            Logger.log(`Sheet "${submission.sheetName}" had no headers. Creating from payload keys.`);
            sheet.clearContents(); // Clear if only one potentially empty row
            sheet.appendRow(Object.keys(submission.payload));
            SpreadsheetApp.flush();
            // Re-fetch headers
            headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
          } else {
             throw new Error(`Sheet "${submission.sheetName}" has no effective header row defined. Please ensure the first row contains field names.`);
          }
        }
        
        // Create an ordered row based on sheet headers
        const newRow = headers.map(header => {
          let value = submission.payload[header];
          if (value === undefined || value === null) {
            return ""; // Use empty string for missing or null values
          }
          // Google Sheets can often auto-convert ISO date/datetime strings.
          // If specific formatting or timezone handling is needed, do it here.
          // Example: if (header.toLowerCase().includes("date") && typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
          //   try { return new Date(value); } catch (dateErr) { return value; }
          // }
          return value;
        });

        sheet.appendRow(newRow);
        response.successfullySyncedIds.push(submission.id); // Add client's local ID to success list

      } catch (individualError) {
        errorsEncountered.push(`Error for submission ID ${submission.id} (Form: ${submission.formTitle || submission.formId}): ${individualError.message}`);
        Logger.log(`Error processing submission ID ${submission.id}: ${individualError.message} \nPayload: ${JSON.stringify(submission.payload).substring(0,300)}`);
      }
    }); // End of forEach submission

    if (errorsEncountered.length === 0) {
      response.status = "success";
      response.message = `${requestData.submissions.length} submission(s) processed and saved successfully.`;
    } else {
      if (response.successfullySyncedIds.length > 0) {
        response.status = "partial_success";
        response.message = `Processed ${requestData.submissions.length} submissions. ${response.successfullySyncedIds.length} saved. Errors on others: ${errorsEncountered.join("; ")}`;
      } else {
        response.status = "error";
        response.message = `All submissions failed. Errors: ${errorsEncountered.join("; ")}`;
      }
    }

  } catch (error) {
    Logger.log(`Critical Error in doPost: ${error.toString()}\nStack: ${error.stack || 'N/A'}\nRequest Body (first 500 chars): ${e && e.postData && e.postData.contents ? e.postData.contents.substring(0,500) : 'N/A'}`);
    response.status = "error";
    response.message = `Server error: ${error.message}. Check Apps Script logs for details.`;
  }
  
  // Return a JSON response. GAS requires it to be text output with JSON MIME type.
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- Utility / Setup Function ---

/**
 * Sets up the Google Sheets with necessary tabs and header rows.
 * Run this function manually from the Apps Script editor once.
 * It uses a simplified representation of FORM_DEFINITIONS from config.js.
 * For robustness, ensure field names in headers match 'name' attributes in JSON form definitions.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // This structure should mirror FORM_DEFINITIONS in config.js for sheetName
  // And the 'fields' should represent the 'name' attributes from the corresponding JSON form files.
  const sheetSetups = {
    "Health": ["entryId", "submissionTimestamp", "facilityName", "reportingDate", "facilityType", "servicesOffered", "officerInCharge", "dataCollector", "overallComments"],
    "WASH": ["entryId", "submissionTimestamp", "activityDate", "locationName", "activityType", "numberOfParticipants", "waterSourceCondition", "keyObservations", "dataCollector"],
    "GBV": ["caseId", "reportTimestamp", "dateOfIncident", "locationOfIncident", "typeOfViolence", "survivorAgeGroup", "survivorSex", "servicesProvided", "caseWorker", "consentForSharing"],
    "Nutrition": ["entryId", "submissionTimestamp", "activityDate", "location", "activityType", "beneficiariesReached", "notes", "dataCollector"],
    "Finance": ["transactionId", "submissionTimestamp", "transactionDate", "description", "category", "amount", "currency", "notes", "recordedBy"],
    "HR": ["recordId", "submissionTimestamp", "effectiveDate", "employeeName", "recordType", "details", "hrOfficer"],
    "Audit": ["auditId", "submissionTimestamp", "auditDate", "auditedEntity", "auditArea", "findingReference", "observation", "recommendation", "riskLevel", "auditorName"],
    "Logistics": ["logId", "submissionTimestamp", "logDate", "itemDescription", "logType", "quantity", "origin", "destination", "notes", "logisticsOfficer"],
    "ChildProtection": ["caseId", "submissionTimestamp", "assessmentDate", "childAge", "childSex", "protectionConcern", "actionTaken", "caseWorker"],
    "FSL": ["entryId", "submissionTimestamp", "activityDate", "location", "fslActivity", "householdsReached", "notes", "fieldOfficer"],
    "IT": ["ticketId", "submissionTimestamp", "requestDate", "userName", "issueType", "description", "status", "itOfficer"],
    "MNE": ["dataEntryId", "submissionTimestamp", "collectionDate", "project", "indicator", "indicatorValue", "disaggregation", "source", "comments", "mneOfficer"],
    "General": ["recordId", "submissionTimestamp", "recordDate", "category", "subject", "details", "customField1", "customField2", "customField3", "recordedBy"]
  };

  let summaryLog = [];

  for (const sheetName in sheetSetups) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      summaryLog.push(`Sheet "${sheetName}" created.`);
    } else {
      summaryLog.push(`Sheet "${sheetName}" already exists.`);
    }
    
    // Check if headers exist (very basic check: is row 1 empty?)
    // A more robust check would be to see if sheet.getLastRow() is 0 or if actual headers match.
    const firstRowRange = sheet.getRange(1, 1, 1, sheet.getMaxColumns());
    const firstRowValues = firstRowRange.getValues()[0];
    const headersExist = firstRowValues.some(cell => cell !== ""); // True if any cell in row 1 is not empty

    if (!headersExist || sheet.getLastRow() === 0) {
      // If sheet is new or first row is empty, add headers.
      // It's safer to clear the first row if it might contain partial/old data.
      if (headersExist) { // implies sheet.getLastRow() > 0 but firstRowValues was empty, unlikely but possible
          firstRowRange.clearContent(); // Clear content if it was just empty strings
      }
      const headers = sheetSetups[sheetName];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      summaryLog.push(`Headers added/updated for "${sheetName}".`);
    } else {
      summaryLog.push(`Headers appear to exist in "${sheetName}". Review manually if unsure.`);
    }
  }
  SpreadsheetApp.flush(); // Apply all pending changes.
  Logger.log("Sheet setup process complete. Summary:\n" + summaryLog.join("\n"));
  Browser.msgBox("Sheet Setup Complete", "Sheets and headers have been checked/created. Review logs for details.", Browser.Buttons.OK);
}
```
