<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your Bhaktivedanta Health Care Center app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create `.env.local` from `.env.example` and set Firebase values.
3. In Firebase Console, enable:
   - Authentication: `Email/Password` and `Google`
   - Firestore Database
4. Publish Firestore security rules from `firestore.rules`.
5. Create your first admin user document manually in Firestore:
   - Collection: `users`
   - Document ID: `<firebase_auth_uid>`
   - Fields: `name`, `email`, `role: "ADMIN"`
6. Run the app:
   `npm run dev`

## Run with Docker

This repository now includes a two-service Docker setup:
- `bvc-web` -> React/Vite frontend on Node 24 (`http://localhost:3000`)
- `bvc-functions` -> Firebase Functions workspace on Node 18 (build container)

Commands (from `BVC` folder):

1. Build/start:
   `docker compose up --build`
2. Run detached:
   `docker compose up --build -d`
3. Stop/remove:
   `docker compose down`
4. View logs:
   `docker compose logs -f bvc-web`
   `docker compose logs -f bvc-functions`

## Razorpay setup (real payment)

The payment flow now uses real Razorpay order creation and signature verification.

1. Frontend public key:
   - Add to `.env.local`:
   - `VITE_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx`

2. Functions secret keys:
   - Set in Firebase Functions environment:
   - `RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx`
   - `RAZORPAY_KEY_SECRET=your_razorpay_secret`

3. Install/update Functions dependencies:
   - `cd functions`
   - `npm install`

4. Build and deploy functions:
   - `npm run build`
   - `firebase deploy --only functions`

5. Ensure callback flow routes are deployed from the current app build:
   - `/payment-gateway`
   - `/payment-callback`

## What is connected to Firebase now

- Authentication: Email/Password + Google
- Role-based login via Firestore user profile (`users/{uid}`)
- Appointment creation (`appointments`)
- Feedback submission + public approved list (`feedback`)
- Doctor availability save/load (`availability`)

## Important security note

Do not use client-side staff secret keys for role control in production.
Use admin-provisioned roles (or custom claims) from secure server-side workflows.
