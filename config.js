// Configuration for the M&E Toolkit App

// Replace this URL with your actual Google Apps Script Web App URL after deployment
const WEB_APP_URL = "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HEREhttps://script.google.com/macros/s/AKfycbzdrzACePEwLKc_2pDunT8LqV42j8sKdu6aExTBgghaTbLfkJkSDJyqRmL_b3hriiYw3w/exec";

// Define the list of forms and their corresponding JSON file names
// This will be used by forms.js to populate the navigation and fetch form definitions.
// The key can be used as an identifier, and the value is the path to the JSON file.
const FORM_DEFINITIONS = {
    "health": { title: "Health", file: "forms/healthForm.json", sheetName: "Health" },
    "wash": { title: "WASH", file: "forms/washForm.json", sheetName: "WASH" },
    "gbv": { title: "GBV", file: "forms/gbvForm.json", sheetName: "GBV" },
    "nutrition": { title: "Nutrition", file: "forms/nutritionForm.json", sheetName: "Nutrition" },
    "finance": { title: "Finance", file: "forms/financeForm.json", sheetName: "Finance" },
    "hr": { title: "HR", file: "forms/hrForm.json", sheetName: "HR" },
    "audit": { title: "Audit", file: "forms/auditForm.json", sheetName: "Audit" },
    "logistics": { title: "Logistics", file: "forms/logisticsForm.json", sheetName: "Logistics" },
    "childProtection": { title: "Child Protection", file: "forms/childProtectionForm.json", sheetName: "ChildProtection" },
    "fsl": { title: "FSL", file: "forms/fslForm.json", sheetName: "FSL" },
    "it": { title: "IT", file: "forms/itForm.json", sheetName: "IT" },
    "mne": { title: "M&E", file: "forms/mneForm.json", sheetName: "MNE" },
    "general": { title: "General", file: "forms/generalForm.json", sheetName: "General" }
    // Add more forms here if needed
};

// Hardcoded users for login. In a real app, this would come from a secure backend.
// Roles: Admin, Officer, Auditor
const USERS = {
    "admin": { password: "password123", role: "Admin", name: "Admin User" },
    "officer": { password: "password123", role: "Officer", name: "Field Officer" },
    "auditor": { password: "password123", role: "Auditor", name: "Audit Staff" }
};


// Utility function to generate a unique ID (simple version)
function generateUniqueId(prefix = 'item') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Utility function to get current date in YYYY-MM-DD format
function getCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Utility function to get current datetime in YYYY-MM-DDTHH:mm format for datetime-local input
function getCurrentDateTimeLocal() {
    const now = new Date();
    // Adjust for local timezone to ensure the input displays correctly
    const offset = now.getTimezoneOffset();
    const adjustedDate = new Date(now.getTime() - (offset * 60 * 1000));
    return adjustedDate.toISOString().slice(0, 16);
}

// Expose constants/functions if needed globally, though it's better to import/pass them around.
// For this simple structure, login.js and forms.js will directly access these constants.
console.log("config.js loaded.");
// WEB_APP_URL, FORM_DEFINITIONS, USERS, generateUniqueId, getCurrentDate, getCurrentDateTimeLocal are now globally available in this scope.
// If using modules, you would export them.
