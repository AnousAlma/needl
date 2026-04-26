# Privacy Policy

**Effective Date:** April 26, 2026  
**App:** Needl — MongoDB Atlas Explorer  
**Developer:** AnousAlma

---

## 1. Overview

Needl ("the App", "we", "us") is a mobile and web application that lets you explore and manage your own MongoDB Atlas databases directly from your device. This Privacy Policy explains what information we collect, how we use it, and how we protect it.

By using Needl, you agree to the practices described in this policy.

---

## 2. Information We Collect

### 2.1 Account Information (Firebase Authentication)
When you sign in, we use **Firebase Authentication** (provided by Google LLC) to manage your identity. This means we collect:
- Email address
- Authentication tokens (Firebase ID tokens) used to verify your identity with the backend API

We do **not** store your password. Authentication is handled entirely by Firebase.

### 2.2 MongoDB Connection Data
To connect to your Atlas cluster, you provide a **MongoDB connection URI**. This URI may contain:
- Your Atlas hostname
- Your Atlas database username and password (embedded in the URI)

This data is stored **locally on your device** (e.g., in device storage via the app) so you can re-use saved connections. Connection URIs are transmitted to the Needl backend API solely to execute the database operations you request (listing databases, querying documents, etc.). They are **not** persisted on our servers beyond the lifetime of a single request.

### 2.3 Saved Query Patterns
You may save and re-use query filters. These are stored **locally on your device** and are not sent to our servers except as part of executing a query.

### 2.4 Usage Data
We do not currently collect analytics or crash reports beyond what Firebase may collect incidentally as part of authentication. We do not use third-party analytics SDKs.

### 2.5 Donation / Payment Information (Optional)
If you choose to support Needl via a donation, payments are processed by **Stripe, Inc.** We do not receive or store your credit card details. Stripe provides us only with a payment confirmation. See [Stripe's Privacy Policy](https://stripe.com/privacy) for details on how Stripe handles your payment data.

---

## 3. How We Use Your Information

| Data | Purpose |
|---|---|
| Email / Firebase auth token | Authenticate requests to the Needl backend API |
| MongoDB connection URI | Execute database operations you initiate |
| Saved queries | Provide a faster query experience in the app |
| Stripe payment confirmation | Confirm a successful donation |

We do **not** sell, rent, or share your personal information with third parties for marketing purposes.

---

## 4. Data Storage and Security

- **Connection URIs** are stored locally on your device using the app's secure storage. They are transmitted over HTTPS to our backend API.
- **Firebase ID tokens** are short-lived and rotated automatically by Firebase.
- Our backend API verifies your Firebase token on every request and does not cache credentials.
- We use industry-standard HTTPS/TLS for all network communication between the app and backend.

Despite these measures, no method of transmission over the internet is 100% secure. You are responsible for keeping your MongoDB connection URIs safe and for revoking any compromised credentials directly in MongoDB Atlas.

---

## 5. Third-Party Services

Needl integrates with the following third-party services, each governed by their own privacy policies:

| Service | Purpose | Privacy Policy |
|---|---|---|
| **Firebase (Google)** | Authentication | [firebase.google.com/support/privacy](https://firebase.google.com/support/privacy) |
| **MongoDB Atlas** | Your database provider | [mongodb.com/legal/privacy-policy](https://www.mongodb.com/legal/privacy-policy) |
| **Stripe** | Optional donation processing | [stripe.com/privacy](https://stripe.com/privacy) |

Needl is an **independent project** and is not affiliated with, endorsed by, or sponsored by MongoDB, Inc. MongoDB, MongoDB Atlas, and MongoDB Compass are trademarks of their respective owners.

---

## 6. Children's Privacy

Needl is a developer tool intended for adults. We do not knowingly collect personal information from children under the age of 13 (or the equivalent minimum age in your jurisdiction). If you believe a child has provided personal information through the App, please contact us and we will delete it promptly.

---

## 7. Your Rights

Depending on your location, you may have the right to:
- **Access** the personal data we hold about you
- **Delete** your account and associated data
- **Correct** inaccurate information

To exercise any of these rights, please contact us at the email below. Note that most user data (connection URIs, saved queries) is stored locally on your device and can be deleted at any time by uninstalling the App or clearing its data.

---

## 8. Data Retention

- Firebase authentication data is retained as long as your account exists. You may delete your account via the App settings.
- We do not retain MongoDB connection URIs or query data on our servers after a request completes.
- Stripe retains payment records according to their own policy.

---

## 9. Changes to This Policy

We may update this Privacy Policy from time to time. When we do, we will revise the **Effective Date** at the top of this page. Continued use of the App after changes constitutes acceptance of the updated policy.

---

## 10. Contact

If you have questions or concerns about this Privacy Policy, please open an issue in the [Needl GitHub repository](https://github.com/AnousAlma/needl) or contact the developer directly through GitHub.
