# Debt Dashboard Backend

This backend integrates Google Gemini, LangChain, and Gmail OAuth for bill detection and debt tracking. It is containerized for deployment to Google Cloud Run.

## Features

- Gemini 3 Pro (Preview) agent integration
- Gmail OAuth2 authentication and bill detection
- Express REST API
- Environment variable support via `.env`
- Dockerized for Cloud Run

## Endpoints

<url> = eg. debt-dashboard-backend-wys33etura-km.a.run.app

- `GET /` — Health check
- `GET /gmail/auth` — Start Gmail OAuth flow
- `GET /exchange` — OAuth2 callback, exchanges code for tokens and redirects to `/gmail/bills`
- `GET /gmail/bills` — Lists recent emails with bill/invoice/payment subjects

## Usage

### Local Development

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create a `.env` file:

   ```env
   GOOGLE_API_KEY=your_google_api_key
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REDIRECT_URI=https://<url>/exchange
   ```

3. Build and start:

   ```sh
   npm run build && npm start
   ```

4. Example request:

   ```sh
   curl -X GET https://<url>/gmail/bills -H "Content-Type: application/json" -d '{"question":"Who won the F1 championship in 2024?"}'
   ```

### Gmail OAuth Flow

- Visit `/gmail/auth` to start authentication.
- After consent, Google redirects to `/exchange?code=...`.
- The backend exchanges the code for tokens and redirects to `/gmail/bills?token=...`.
- `/gmail/bills` lists recent bill-related emails.

### Docker & Cloud Run

1. Build and push Docker image:

   ```sh
   gcloud builds submit --tag gcr.io/<PROJECT_ID>/debt-dashboard-backend .
   ```

2. Deploy to Cloud Run (replace with your keys):

   ```sh
   gcloud run deploy debt-dashboard-backend \
     --image gcr.io/<PROJECT_ID>/debt-dashboard-backend \
     --platform managed \
     --region <REGION> \
     --allow-unauthenticated \
     --set-env-vars GOOGLE_API_KEY=your_google_api_key,SERP_API_KEY=your_serp_api_key,GOOGLE_CLIENT_ID=your_google_client_id,GOOGLE_CLIENT_SECRET=your_google_client_secret,GOOGLE_REDIRECT_URI=https://your-service-url/exchange
   ```

## Environment Variables

- `GOOGLE_API_KEY` — Gemini API key
- `SERP_API_KEY` — SerpAPI key
- `GOOGLE_CLIENT_ID` — Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret
- `GOOGLE_REDIRECT_URI` — OAuth redirect URI (must match Google Cloud Console)

## Project Structure

- `src/index.ts` — Main server and agent logic
- `Dockerfile` — Container build instructions
- `.env` — Local environment variables

## Troubleshooting

- Ensure all required environment variables are set in Cloud Run.
- Check Cloud Run logs for startup errors.
- Dockerfile uses `--legacy-peer-deps` for npm install to resolve dependency conflicts.
- Make sure OAuth redirect URI matches your deployed endpoint.

## License

MIT
