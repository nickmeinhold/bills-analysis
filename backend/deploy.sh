#!/bin/bash
set -e

# Configuration
PROJECT_ID="debt-dashboard-project"
SERVICE_NAME="debt-dashboard-backend"
REGION="asia-northeast3"  # km region

echo "🚀 Deploying backend to Cloud Run..."
echo "Project: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo ""

# Load environment variables from .env
source .env

# Get project number
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Calculate the production redirect URI using the actual Cloud Run URL format
PROD_REDIRECT_URI="https://$SERVICE_NAME-$PROJECT_NUMBER.$REGION.run.app/exchange"

echo "Setting environment variables:"
echo "  GOOGLE_REDIRECT_URI: $PROD_REDIRECT_URI"
echo ""

# Build and deploy using Cloud Build (no local Docker build needed)
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --timeout 300s \
  --set-env-vars "NODE_ENV=production,GOOGLE_API_KEY=$GOOGLE_API_KEY,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET,GOOGLE_REDIRECT_URI=$PROD_REDIRECT_URI" \
  --min-instances 0 \
  --max-instances 10

echo ""
echo "✅ Backend deployed successfully!"
echo "URL: https://$SERVICE_NAME-$PROJECT_NUMBER.$REGION.run.app"
