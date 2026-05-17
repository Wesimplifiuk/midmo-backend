# Motorbike Lead Flow Integration

## Overview

This project connects a custom Wix Studio frontend with a Render backend and HubSpot CRM.

The current implementation allows users to submit their contact information through a custom modal form and automatically create/update contacts inside HubSpot.

---

# Current Architecture

Wix Studio Frontend
↓
Custom Modal + HTML Embed Form
↓
Render Backend (Node.js + Express)
↓
HubSpot Forms API
↓
HubSpot CRM Contact Creation

---

# Technologies Used

- Wix Studio
- Render
- Node.js
- Express
- HubSpot Forms API
- Custom HTML Embed
- JavaScript Fetch API

---

# Current Features

## Frontend

- Custom modal popup
- Responsive embedded HTML form
- Custom form styling
- JavaScript fetch requests to backend
- Dynamic open/close modal behavior

---

## Backend

### Hosted on Render

Current backend responsibilities:

- Receive frontend form submissions
- Send data to HubSpot Forms API
- Handle API responses
- Return success/error states to frontend

---

# HubSpot Integration

The backend currently submits data using:

- HubSpot Forms API
- Portal ID
- Form ID

This preserves:

- HubSpot attribution
- Meta Ads tracking
- Original source tracking
- Form analytics
- Lifecycle tracking

---

# Current Flow

1. User clicks CTA button in Wix
2. Custom modal opens
3. User submits:
   - First Name
   - Last Name
   - Email
   - Phone
4. Wix frontend sends request to Render backend
5. Render submits data to HubSpot Forms API
6. HubSpot creates or updates the contact

---

# Next Planned Features

## Motorcycle Lookup Flow

Upcoming implementation:

- Search motorcycle by registration (REG)
- Search HubSpot custom object
- Display motorcycle information dynamically
- Create motorcycle record if not found
- Associate motorcycle with contact

---

# API Endpoints

## POST /search-contact

Handles:

- Contact submissions
- HubSpot Forms API submissions
- Contact creation/update flow

---

# Deployment

## Backend

Hosted on Render:

- Node.js runtime
- Express server
- Environment variables for HubSpot integration

---

# Notes

This project intentionally uses:

- Custom frontend UI
- Custom backend logic
- HubSpot Forms API

instead of native Wix or HubSpot embedded forms in order to maintain:

- Full UI control
- Better UX
- Multi-step flexibility
- CRM integration control
- Marketing attribution tracking