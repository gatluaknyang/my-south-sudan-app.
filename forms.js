document.addEventListener('DOMContentLoaded', async () => {
    // --- Authentication & User Info ---
    const loggedInUser = localStorage.getItem('loggedInUser');
    const userRole = localStorage.getItem('userRole');
    const userNameDisplay = localStorage.getItem('userNameDisplay');

    if (!loggedInUser || !userRole) {
        window.location.href = 'index.html'; // Redirect to login if not authenticated
        return;
    }

    document.getElementById('userNameDisplay').textContent = userNameDisplay || loggedInUser;
    document.getElementById('userRoleDisplay').textContent = userRole;

    document.getElementById('logoutButton').addEventListener('click', () => {
        if (typeof handleUserLogout === 'function') {
            handleUserLogout();
        } else { // Fallback
            console.error("handleUserLogout function not found from login.js");
            localStorage.clear(); // Basic clear as fallback
            window.location.href = 'index.html';
        }
    });

    // --- DOM Element References ---
    const formNavList = document.getElementById('formNavList');
    const viewPendingLink = document.getElementById('viewPendingLink');
    const pendingCountSpan = document.getElementById('pendingCount');
    
    const currentFormTitleH2 = document.getElementById('currentFormTitle');
    const welcomeMessageP = document.getElementById('welcomeMessage');
    const dynamicFormContainer = document.getElementById('dynamicFormContainer');
    const pendingSubmissionsContainer = document.getElementById('pendingSubmissionsContainer');

    const statusMessagesContainer = document.getElementById('statusMessagesContainer');
    const offlineIndicatorDiv = document.getElementById('offlineIndicator');
    // const syncIndicatorDiv = document.getElementById('syncIndicator'); // Not directly used for messages, statusMessagesContainer is.

    let pendingSubmissions = JSON.parse(localStorage.getItem('pendingSubmissions')) || [];
    let currentLoadedFormDefinition = null; // To store the definition of the currently loaded form
    let currentEditingSubmissionId = null; // To store the ID of a pending submission being edited

    // --- Initialization ---
    await populateFormNavigation();
    updatePendingCount();
    checkOnlineStatus();

    window.addEventListener('online', () => { checkOnlineStatus(); attemptSyncAllSubmissions(false); });
    window.addEventListener('offline', checkOnlineStatus);
    
    if (viewPendingLink) {
        viewPendingLink.addEventListener('click', (e) => {
            e.preventDefault();
            displayPendingSubmissionsView();
        });
    }

    // --- Navigation & Form Loading ---
    async function populateFormNavigation() {
        if (!formNavList || typeof FORM_DEFINITIONS === 'undefined') {
            console.error("Form navigation list or FORM_DEFINITIONS not found.");
            return;
        }
        formNavList.innerHTML = ''; // Clear existing

        for (const key in FORM_DEFINITIONS) {
            const formInfo = FORM_DEFINITIONS[key];
            const listItem = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = formInfo.title;
            link.dataset.formkey = key; // Use the key from FORM_DEFINITIONS
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                await loadAndRenderForm(key);
                // Store last active form to potentially reopen on next visit
                localStorage.setItem('lastActiveFormId', key);
            });
            listItem.appendChild(link);
            formNavList.appendChild(listItem);
        }
        
        // Try to load the last active form
        const lastActiveFormId = localStorage.getItem('lastActiveFormId');
        if (lastActiveFormId && FORM_DEFINITIONS[lastActiveFormId]) {
            await loadAndRenderForm(lastActiveFormId);
        }
    }

    async function loadAndRenderForm(formKey, existingData = null, submissionIdToEdit = null) {
        if (typeof FORM_DEFINITIONS === 'undefined' || !FORM_DEFINITIONS[formKey]) {
            showStatusMessage(`Form definition for '${formKey}' not found in config.`, 'error');
            return;
        }

        const formInfo = FORM_DEFINITIONS[formKey];
        try {
            const response = await fetch(formInfo.file);
            if (!response.ok) {
                throw new Error(`Failed to load form definition: ${response.statusText}`);
            }
            currentLoadedFormDefinition = await response.json();
            currentEditingSubmissionId = submissionIdToEdit; // Store if we are editing

            // Update UI
            if (welcomeMessageP) welcomeMessageP.classList.add('hidden');
            if (pendingSubmissionsContainer) pendingSubmissionsContainer.classList.add('hidden');
            if (dynamicFormContainer) dynamicFormContainer.classList.remove('hidden');
            
            if (currentFormTitleH2) currentFormTitleH2.textContent = existingData ? `Edit: ${currentLoadedFormDefinition.title}` : currentLoadedFormDefinition.title;
            
            renderForm(currentLoadedFormDefinition, existingData);

            // Highlight active nav link
            document.querySelectorAll('#formNavList a').forEach(a => a.classList.remove('active'));
            const activeLink = document.querySelector(`#formNavList a[data-formkey="${formKey}"]`);
            if (activeLink) activeLink.classList.add('active');

        } catch (error) {
            console.error("Error loading/rendering form:", error);
            showStatusMessage(`Error loading form '${formInfo.title}': ${error.message}`, 'error');
            if (dynamicFormContainer) dynamicFormContainer.innerHTML = `<p class="error-message">Could not load form: ${formInfo.title}.</p>`;
        }
    }

    // --- Form Rendering Engine ---
    function renderForm(formDef, existingData = null) {
        if (!dynamicFormContainer) return;
        dynamicFormContainer.innerHTML = ''; // Clear previous form

        const formElement = document.createElement('form');
        formElement.id = `${formDef.formId}-form`;
        formElement.dataset.formid = formDef.formId;

        formDef.fields.forEach(field => {
            const group = document.createElement('div');
            group.classList.add('form-group');

            const label = document.createElement('label');
            label.setAttribute('for', field.name);
            label.textContent = field.label + (field.required ? ' *' : '');
            group.appendChild(label);

            let inputElement;
            if (field.type === 'textarea') {
                inputElement = document.createElement('textarea');
            } else if (field.type === 'select') {
                inputElement = document.createElement('select');
                // Add a default blank/prompt option
                const defaultOption = document.createElement('option');
                defaultOption.value = "";
                defaultOption.textContent = field.placeholder || `-- Select ${field.label.replace(' *','')} --`;
                if (field.required && !existingData?.[field.name]) defaultOption.selected = true;
                // if (field.required) defaultOption.disabled = true; // Makes it unselectable once another chosen
                inputElement.appendChild(defaultOption);

                field.options?.forEach(optValue => {
                    const option = document.createElement('option');
                    option.value = optValue; // Assuming optValue is a simple string. If object, use optValue.value and optValue.label
                    option.textContent = optValue;
                    inputElement.appendChild(option);
                });
            } else { // text, date, datetime-local, number, email, tel etc.
                inputElement = document.createElement('input');
                inputElement.type = field.type;
            }

            inputElement.id = field.name;
            inputElement.name = field.name;
            if (field.required) inputElement.required = true;
            if (field.placeholder && field.type !== 'select') inputElement.placeholder = field.placeholder;
            if (field.min) inputElement.min = field.min;
            if (field.max) inputElement.max = field.max;
            if (field.pattern) inputElement.pattern = field.pattern;
            if (field.readonly) inputElement.readOnly = true;
            if (field.readonlyOnEdit && existingData) inputElement.readOnly = true;


            // Auto-population & Default values
            let valueToSet = existingData ? existingData[field.name] : (field.default || '');
            if (!existingData) { // Only auto-populate for new forms
                if (field.autoPopulate) {
                    if (field.autoPopulate === 'date') valueToSet = getCurrentDate();
                    else if (field.autoPopulate === 'datetime') valueToSet = getCurrentDateTimeLocal();
                }
                if (field.fromUser) { // e.g. fromUser: "userNameDisplay" or "userRole"
                    valueToSet = localStorage.getItem(field.fromUser) || '';
                }
                if (field.isId) {
                    valueToSet = generateUniqueId(formDef.formId.substring(0,3));
                    inputElement.readOnly = true; 
                }
            } else if (existingData && field.isId) { // If editing, ID is always readonly
                 inputElement.readOnly = true;
            }
            inputElement.value = valueToSet;
            
            group.appendChild(inputElement);
            formElement.appendChild(group);
        });

        // Action Buttons
        const buttonGroup = document.createElement('div');
        buttonGroup.classList.add('button-group');

        const submitButton = document.createElement('button');
        submitButton.type = 'submit';
        submitButton.textContent = existingData ? 'Update Offline Record' : 'Submit Online';
        submitButton.classList.add('button', 'submit');
        buttonGroup.appendChild(submitButton);

        const saveOfflineButton = document.createElement('button');
        saveOfflineButton.type = 'button'; // Important: not submit
        saveOfflineButton.textContent = existingData ? 'Save Changes Offline' : 'Save Offline';
        saveOfflineButton.classList.add('button', 'save-offline');
        saveOfflineButton.addEventListener('click', () => collectAndSaveForm(formElement, formDef, true, currentEditingSubmissionId));
        buttonGroup.appendChild(saveOfflineButton);
        
        if (existingData) { // If editing a PENDING submission
            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.textContent = 'Cancel Edit';
            cancelButton.classList.add('button', 'cancel');
            cancelButton.addEventListener('click', displayPendingSubmissionsView); // Go back to pending list
            buttonGroup.appendChild(cancelButton);
        }


        formElement.appendChild(buttonGroup);
        formElement.addEventListener('submit', (event) => { // Handles "Submit Online" button
            event.preventDefault();
            collectAndSaveForm(formElement, formDef, false, currentEditingSubmissionId); // false for !isOfflineSave
        });

        dynamicFormContainer.appendChild(formElement);
    }

    function collectAndSaveForm(formElement, formDef, isOfflineSave, editingSubmissionId = null) {
        if (!formElement.checkValidity()) {
            formElement.reportValidity(); // Show HTML5 validation messages
            showStatusMessage("Please fill all required fields correctly.", "warning");
            return;
        }

        const formData = new FormData(formElement);
        const dataPayload = Object.fromEntries(formData.entries());

        const submission = {
            id: editingSubmissionId || generateUniqueId('sub'), // Use existing ID if editing, else new
            formId: formDef.formId,
            formTitle: formDef.title, // For display in pending list
            sheetName: formDef.sheetName || FORM_DEFINITIONS[formDef.formId]?.sheetName || formDef.formId, // Ensure sheetName
            payload: dataPayload,
            submittedAt: new Date().toISOString()
        };

        if (isOfflineSave || !navigator.onLine) {
            saveSubmissionLocally(submission, editingSubmissionId);
            showStatusMessage(`'${formDef.title}' data saved locally. Sync when online.`, 'info');
            if (editingSubmissionId) displayPendingSubmissionsView(); // Refresh pending list if an edit was saved
            else formElement.reset(); // Reset for new entry
            loadAndRenderForm(formDef.formId); // Re-render blank form for next entry (or could clear current)
        } else {
            // Attempt online submission
            submitDataToBackend([submission]); // Backend expects an array
        }
         // After any save/submit, re-render the current form blank for a new entry if not editing
        if (!editingSubmissionId) {
            loadAndRenderForm(formDef.formId);
        }
    }
    
    function saveSubmissionLocally(submission, editingId) {
        if (editingId) {
            const index = pendingSubmissions.findIndex(s => s.id === editingId);
            if (index > -1) pendingSubmissions[index] = submission;
            else pendingSubmissions.push(submission); // Should not happen if editingId is valid
        } else {
            pendingSubmissions.push(submission);
        }
        localStorage.setItem('pendingSubmissions', JSON.stringify(pendingSubmissions));
        updatePendingCount();
    }


    // --- Data Submission & Syncing ---
    async function submitDataToBackend(submissionsBatch) {
        if (!navigator.onLine) {
            showStatusMessage('Offline. Cannot submit directly. Save offline.', 'warning');
            // Data should have already been saved locally if this path is reached unexpectedly
            return;
        }
        if (submissionsBatch.length === 0) return;

        const webAppUrl = typeof WEB_APP_URL !== 'undefined' ? WEB_APP_URL : null;
        if (!webAppUrl || webAppUrl === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
            showStatusMessage('Backend URL not configured. Cannot submit.', 'error');
            // Save these submissions to pending if they weren't already
            submissionsBatch.forEach(sub => saveSubmissionLocally(sub, sub.id)); // Treat as update if ID exists
            return;
        }

        const submitButtonInForm = dynamicFormContainer.querySelector('form .button.submit');
        if (submitButtonInForm) {
            submitButtonInForm.disabled = true;
            submitButtonInForm.innerHTML = '<span class="spinner"></span> Submitting...';
        }
        const syncAllButton = document.getElementById('syncAllPendingButton'); // from pending view
        if (syncAllButton) {
             syncAllButton.disabled = true;
             syncAllButton.innerHTML = '<span class="spinner"></span> Syncing...';
        }


        try {
            const response = await fetch(webAppUrl, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain' }, // GAS doPost often expects text/plain for raw JSON string
                body: JSON.stringify({ submissions: submissionsBatch }) // Send as a batch object
            });
            
            const responseText = await response.text();
            let responseData;
            try { responseData = JSON.parse(responseText); } catch (e) { 
                // Handle non-JSON or malformed JSON from GAS (e.g. HTML error page)
                if (response.ok && responseText.toLowerCase().includes("success")) {
                     responseData = { status: "success", message: responseText, successfullySyncedIds: submissionsBatch.map(s => s.id) };
                } else {
                    throw new Error(`Non-JSON response from server: ${responseText.substring(0, 200)}`);
                }
            }

            if (response.ok && responseData.status === 'success') {
                showStatusMessage(responseData.message || `${submissionsBatch.length} record(s) submitted successfully!`, 'success');
                // Remove successfully synced items from pendingSubmissions
                const syncedIds = responseData.successfullySyncedIds || submissionsBatch.map(s => s.id); // Assume all if not specified
                pendingSubmissions = pendingSubmissions.filter(s => !syncedIds.includes(s.id));
                localStorage.setItem('pendingSubmissions', JSON.stringify(pendingSubmissions));
                updatePendingCount();

                // If a single form was submitted and successful, reset that form
                if (submissionsBatch.length === 1 && currentLoadedFormDefinition && submissionsBatch[0].formId === currentLoadedFormDefinition.formId) {
                    const formElement = document.getElementById(`${currentLoadedFormDefinition.formId}-form`);
                    if (formElement) formElement.reset();
                    loadAndRenderForm(currentLoadedFormDefinition.formId); // Re-render blank
                }
                 // If currently viewing pending submissions, refresh the list
                if (!pendingSubmissionsContainer.classList.contains('hidden')) {
                    displayPendingSubmissionsView();
                }


            } else { // Partial success or error from backend
                 showStatusMessage(`Submission issue: ${responseData.message || 'Unknown server error.'}`, 'error');
                 // If some were successful, backend should tell us via successfullySyncedIds
                 if (responseData.successfullySyncedIds && responseData.successfullySyncedIds.length > 0) {
                    pendingSubmissions = pendingSubmissions.filter(s => !responseData.successfullySyncedIds.includes(s.id));
                    localStorage.setItem('pendingSubmissions', JSON.stringify(pendingSubmissions));
                    updatePendingCount();
                 }
                 // Any failed items remain in pendingSubmissions.
            }
        } catch (error) {
            console.error('Submission error:', error);
            showStatusMessage(`Network or submission error: ${error.message}. Data saved locally.`, 'error');
            // Ensure all items in this batch are saved locally if they weren't already
            submissionsBatch.forEach(sub => saveSubmissionLocally(sub, sub.id));
        } finally {
            if (submitButtonInForm) {
                submitButtonInForm.disabled = false;
                submitButtonInForm.textContent = 'Submit Online';
            }
             if (syncAllButton) {
                syncAllButton.disabled = false;
                syncAllButton.textContent = 'Sync All Pending';
            }
        }
    }
    
    async function attemptSyncAllSubmissions(isManualAttempt = true) {
        if (!navigator.onLine) {
            if(isManualAttempt) showStatusMessage("You are offline. Cannot sync.", "warning");
            return;
        }
        if (pendingSubmissions.length === 0) {
            if(isManualAttempt) showStatusMessage("No pending submissions to sync.", "info");
            return;
        }
        showStatusMessage(`Attempting to sync ${pendingSubmissions.length} pending submission(s)...`, "info");
        await submitDataToBackend([...pendingSubmissions]); // Send a copy
    }


    // --- Pending Submissions View ---
    function displayPendingSubmissionsView() {
        currentLoadedFormDefinition = null; // No specific form is active
        currentEditingSubmissionId = null;
        if (welcomeMessageP) welcomeMessageP.classList.add('hidden');
        if (dynamicFormContainer) dynamicFormContainer.classList.add('hidden');
        if (pendingSubmissionsContainer) pendingSubmissionsContainer.classList.remove('hidden');
        document.querySelectorAll('#formNavList a').forEach(a => a.classList.remove('active'));


        if (currentFormTitleH2) currentFormTitleH2.textContent = `Pending Offline Submissions (${pendingSubmissions.length})`;
        pendingSubmissionsContainer.innerHTML = ''; // Clear previous list

        if (pendingSubmissions.length === 0) {
            pendingSubmissionsContainer.innerHTML = '<p>No pending submissions found.</p>';
            return;
        }

        const list = document.createElement('ul');
        list.id = 'pending-submissions-list';
        pendingSubmissions.forEach((submission) => {
            const listItem = document.createElement('li');
            
            const infoDiv = document.createElement('div');
            infoDiv.classList.add('info');
            const primaryIdField = Object.keys(submission.payload)[0]; // Use first field as a simple identifier
            infoDiv.innerHTML = `
                <strong>${submission.formTitle || submission.formId}</strong> - <em>${submission.payload[primaryIdField] || submission.id}</em><br>
                <small>Saved: ${new Date(submission.submittedAt).toLocaleString()}</small>
            `;
            listItem.appendChild(infoDiv);

            const actionsDiv = document.createElement('div');
            actionsDiv.classList.add('actions');

            const editButton = document.createElement('button');
            editButton.textContent = 'Edit';
            editButton.classList.add('button', 'action-button');
            editButton.onclick = () => {
                // Load the form definition for this submission's formId then render with its payload
                const formKey = Object.keys(FORM_DEFINITIONS).find(key => FORM_DEFINITIONS[key].title === submission.formTitle || key === submission.formId);
                if (formKey) {
                    loadAndRenderForm(formKey, submission.payload, submission.id);
                } else {
                    showStatusMessage(`Cannot edit: Form definition for '${submission.formTitle || submission.formId}' not found.`, 'error');
                }
            };
            actionsDiv.appendChild(editButton);

            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.classList.add('button', 'secondary-button'); // Or 'cancel' class
            deleteButton.onclick = () => {
                if (confirm('Are you sure you want to delete this pending submission? This cannot be undone.')) {
                    pendingSubmissions = pendingSubmissions.filter(s => s.id !== submission.id);
                    localStorage.setItem('pendingSubmissions', JSON.stringify(pendingSubmissions));
                    updatePendingCount();
                    displayPendingSubmissionsView(); // Refresh the list
                    showStatusMessage('Submission deleted locally.', 'info');
                }
            };
            actionsDiv.appendChild(deleteButton);
            listItem.appendChild(actionsDiv);
            list.appendChild(listItem);
        });
        pendingSubmissionsContainer.appendChild(list);
        
        if (pendingSubmissions.length > 0) {
            const syncAllButton = document.createElement('button');
            syncAllButton.id = 'syncAllPendingButton';
            syncAllButton.textContent = 'Sync All Pending';
            syncAllButton.classList.add('button', 'sync-offline');
            syncAllButton.style.marginTop = '20px';
            syncAllButton.onclick = () => attemptSyncAllSubmissions(true);
            pendingSubmissionsContainer.appendChild(syncAllButton);
        }
    }

    // --- UI Helper Functions ---
    function updatePendingCount() {
        if (pendingCountSpan) pendingCountSpan.textContent = pendingSubmissions.length;
    }

    function checkOnlineStatus() {
        const isOnline = navigator.onLine;
        if (offlineIndicatorDiv) offlineIndicatorDiv.classList.toggle('hidden', isOnline);
        // Potentially disable/enable certain buttons based on online status
        const onlineSubmitButtons = dynamicFormContainer.querySelectorAll('form .button.submit');
        onlineSubmitButtons.forEach(btn => {
            // btn.disabled = !isOnline; // This might be too aggressive; let submission logic handle it
            // btn.title = isOnline ? "Submit data to server" : "Cannot submit online, please save offline";
        });
    }

    function showStatusMessage(message, type = 'info') { // types: info, success, warning, error
        if (!statusMessagesContainer) return;
        statusMessagesContainer.textContent = message;
        statusMessagesContainer.className = `status-${type}`; // Resets other classes
        statusMessagesContainer.classList.remove('hidden');

        setTimeout(() => {
            statusMessagesContainer.classList.add('hidden');
            statusMessagesContainer.className = ''; // Clear classes
        }, type === 'error' || type === 'warning' ? 6000 : 4000);
    }
    
    console.log("forms.js loaded and initialized.");
});
